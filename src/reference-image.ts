/** Safe Host-side resolution of DSH conversation and workspace image references. */
import { readFile, realpath, stat } from 'node:fs/promises'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import type { ImageAttachmentRef, ImageMediaType, StoredImageAttachment } from '@deepseek-ai/dsh-attachment'

/** Provider-neutral image bytes passed to the CPA edit contract. */
export interface ResolvedReferenceImage {
  data: Uint8Array
  mediaType: ImageMediaType
}

/** Small structural session surface used by the edit tool. */
export interface ReferenceImageAgent {
  session: {
    deriveMessages(): readonly unknown[]
    header?: { cwd?: string }
  }
}

/** Small structural attachment surface used by the edit tool. */
export interface ReferenceImageStore {
  readImage(ref: ImageAttachmentRef, signal?: AbortSignal): Promise<StoredImageAttachment>
}

/** Resolve one or more references in caller order or latest-user upload order. */
export async function resolveReferenceImages(input: {
  agent?: ReferenceImageAgent
  attachments: ReferenceImageStore
  sourceAttachmentId?: string
  sourceAttachmentIds?: readonly string[]
  sourcePath?: string
  sourcePaths?: readonly string[]
  maxBytes?: number
  signal: AbortSignal
}): Promise<ResolvedReferenceImage[]> {
  const attachmentIds = mergeSelectors({
    single: input.sourceAttachmentId,
    multiple: input.sourceAttachmentIds,
    singleName: 'source_attachment_id',
    multipleName: 'source_attachment_ids',
    equal: attachmentIdsEqual,
  })
  const paths = mergeSelectors({
    single: input.sourcePath,
    multiple: input.sourcePaths,
    singleName: 'source_path',
    multipleName: 'source_paths',
    equal: (left, right) => left.trim() === right.trim(),
  })
  if (attachmentIds !== undefined && paths !== undefined) {
    throw new Error('edit_image accepts only one of source_attachment_id, source_attachment_ids, source_path, or source_paths')
  }

  if (paths !== undefined) {
    return Promise.all(paths.map(sourcePath => readWorkspaceReferenceImage({
      sourcePath,
      ...(input.agent?.session.header?.cwd === undefined ? {} : { workspaceRoot: input.agent.session.header.cwd }),
      ...(input.maxBytes === undefined ? {} : { maxBytes: input.maxBytes }),
      signal: input.signal,
    })))
  }

  if (input.agent === undefined) {
    throw new Error('edit_image requires an active DSH agent session to resolve a reference image')
  }

  const refs = findReferenceImages(input.agent.session.deriveMessages(), attachmentIds)
  if (refs.length === 0) {
    if (attachmentIds !== undefined) {
      throw new Error(`edit_image could not find image attachment ${attachmentIds[0] ?? 'unknown'} in the current conversation`)
    }
    throw new Error('edit_image requires an image in the current conversation; upload or generate an image first')
  }
  if (attachmentIds !== undefined && refs.length !== attachmentIds.length) {
    const missing = attachmentIds.find(id => !refs.some(ref => attachmentIdsEqual(String(ref.attachmentId), id)))
    throw new Error(`edit_image could not find image attachment ${missing ?? 'unknown'} in the current conversation`)
  }

  return Promise.all(refs.map(async ref => {
    const stored = await input.attachments.readImage(ref, input.signal)
    if (input.maxBytes !== undefined && stored.data.byteLength > input.maxBytes) {
      throw new Error(`edit_image source image is too large (${stored.data.byteLength} bytes; maximum ${input.maxBytes})`)
    }
    return { data: new Uint8Array(stored.data), mediaType: stored.ref.mediaType }
  }))
}

/** Backwards-friendly single-reference helper for callers that need one image. */
export async function resolveReferenceImage(input: Parameters<typeof resolveReferenceImages>[0]): Promise<ResolvedReferenceImage> {
  const images = await resolveReferenceImages(input)
  const image = images[images.length - 1]
  if (image === undefined) throw new Error('edit_image requires a reference image')
  return image
}

/** Find explicit references in caller order, or all images from the newest user upload. */
export function findReferenceImages(messages: readonly unknown[], sourceAttachmentIds?: readonly string[]): ImageAttachmentRef[] {
  if (sourceAttachmentIds !== undefined) {
    return sourceAttachmentIds.flatMap(id => {
      const ref = findReferenceImage(messages, id)
      return ref === undefined ? [] : [ref]
    })
  }

  const latestHuman = [...messages].reverse().find(message => isHumanMessage(message))
  if (latestHuman !== undefined) {
    const refs = collectInBlocks(record(latestHuman)?.content)
    if (refs.length > 0) return refs
  }

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const refs = collectInBlocks(record(messages[index])?.content)
    if (refs.length > 0) return refs
  }
  return []
}

/** Find one matching image recursively through message and tool-result content. */
export function findReferenceImage(messages: readonly unknown[], sourceAttachmentId?: string): ImageAttachmentRef | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const found = findInBlocks(record(messages[index])?.content, sourceAttachmentId)
    if (found !== undefined) return found
  }
  return undefined
}

async function readWorkspaceReferenceImage(input: {
  sourcePath: string
  workspaceRoot?: string
  maxBytes?: number
  signal: AbortSignal
}): Promise<ResolvedReferenceImage> {
  const requested = input.sourcePath.trim()
  if (requested.length === 0) throw new Error('edit_image source_path must not be empty')
  if (input.workspaceRoot === undefined) throw new Error('edit_image source_path requires an active DSH session workspace')

  const root = resolve(input.workspaceRoot)
  const candidate = isAbsolute(requested) ? resolve(requested) : resolve(root, requested)
  if (!containsPath(root, candidate)) throw new Error(`edit_image source_path must stay inside the session workspace: ${requested}`)

  let realRoot: string
  let realCandidate: string
  try {
    ;[realRoot, realCandidate] = await Promise.all([realpath(root), realpath(candidate)])
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new Error(`edit_image could not find workspace image: ${requested}`)
    throw error
  }
  if (!containsPath(realRoot, realCandidate)) throw new Error(`edit_image source_path resolves outside the session workspace: ${requested}`)

  const file = await stat(realCandidate)
  if (!file.isFile()) throw new Error(`edit_image source_path is not a file: ${requested}`)
  if (input.maxBytes !== undefined && file.size > input.maxBytes) {
    throw new Error(`edit_image source image is too large (${file.size} bytes; maximum ${input.maxBytes})`)
  }

  const data = new Uint8Array(await readFile(realCandidate, { signal: input.signal }))
  const mediaType = detectImageMediaType(data)
  if (mediaType === undefined) throw new Error(`edit_image source_path is not a supported image: ${requested}`)
  return { data, mediaType }
}

function isHumanMessage(value: unknown): boolean {
  const message = record(value)
  const source = record(message?.source)
  return source?.kind === 'user' || message?.role === 'user'
}

function collectInBlocks(value: unknown): ImageAttachmentRef[] {
  if (!Array.isArray(value)) return []
  const refs: ImageAttachmentRef[] = []
  for (const block of value) {
    const entry = record(block)
    if (entry?.type === 'image') {
      const ref = imageAttachmentRef(entry.attachment)
      if (ref !== undefined) refs.push(ref)
    }
    if (entry?.type === 'tool-result') refs.push(...collectInBlocks(entry.content))
  }
  return refs
}

function findInBlocks(value: unknown, sourceAttachmentId?: string): ImageAttachmentRef | undefined {
  if (!Array.isArray(value)) return undefined
  for (let index = value.length - 1; index >= 0; index -= 1) {
    const entry = record(value[index])
    if (entry?.type === 'image') {
      const ref = imageAttachmentRef(entry.attachment)
      if (ref !== undefined && (sourceAttachmentId === undefined || attachmentIdsEqual(String(ref.attachmentId), sourceAttachmentId))) return ref
    }
    if (entry?.type === 'tool-result') {
      const nested = findInBlocks(entry.content, sourceAttachmentId)
      if (nested !== undefined) return nested
    }
  }
  return undefined
}

function imageAttachmentRef(value: unknown): ImageAttachmentRef | undefined {
  const ref = record(value)
  if (ref === undefined) return undefined
  if (typeof ref.attachmentId !== 'string' || !imageMediaType(ref.mediaType)) return undefined
  if (!nonNegativeInteger(ref.bytes) || !positiveInteger(ref.width) || !positiveInteger(ref.height)) return undefined
  return ref as unknown as ImageAttachmentRef
}

function mergeSelectors(input: {
  single: string | undefined
  multiple: readonly string[] | undefined
  singleName: string
  multipleName: string
  equal: (left: string, right: string) => boolean
}): readonly string[] | undefined {
  if (input.multiple === undefined) return input.single === undefined ? undefined : [input.single]
  if (input.multiple.length === 0) {
    if (input.single !== undefined) return [input.single]
    throw new Error(`edit_image ${input.multipleName} must not be empty`)
  }
  if (input.single !== undefined && !input.multiple.some(value => input.equal(input.single!, value))) {
    throw new Error(`edit_image ${input.singleName} must also appear in ${input.multipleName} when both are provided`)
  }
  return input.multiple
}

function attachmentIdsEqual(actual: string, requested: string): boolean {
  if (actual === requested) return true
  const actualDigest = sha256Digest(actual)
  const requestedDigest = sha256Digest(requested)
  return actualDigest !== undefined && actualDigest === requestedDigest
}

function sha256Digest(value: string): string | undefined {
  const match = /^(?:sha256:)?([0-9a-f]{64})$/iu.exec(value.trim())
  return match?.[1]?.toLowerCase()
}

function detectImageMediaType(data: Uint8Array): ImageMediaType | undefined {
  if (startsWith(data, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png'
  if (startsWith(data, [0xff, 0xd8, 0xff])) return 'image/jpeg'
  if (ascii(data, 0, 6) === 'GIF87a' || ascii(data, 0, 6) === 'GIF89a') return 'image/gif'
  if (ascii(data, 0, 4) === 'RIFF' && ascii(data, 8, 4) === 'WEBP') return 'image/webp'
  return undefined
}

function imageMediaType(value: unknown): value is ImageMediaType {
  return value === 'image/png' || value === 'image/jpeg' || value === 'image/webp' || value === 'image/gif'
}

function startsWith(data: Uint8Array, signature: readonly number[]): boolean {
  return signature.every((byte, index) => data[index] === byte)
}

function ascii(data: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...data.subarray(offset, offset + length))
}

function containsPath(parent: string, child: string): boolean {
  const rel = relative(parent, child)
  return rel === '' || (rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel))
}

function positiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
}

function nonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}
