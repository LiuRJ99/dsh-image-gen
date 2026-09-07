/** Persist one generated image as a file under the session workspace. */
import { createHash, randomUUID } from 'node:crypto'
import { lstat, mkdir, readFile, realpath, rename, unlink, writeFile } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'

/** File extension for each supported image media type. */
const EXTENSION: Record<ImageAttachmentRef['mediaType'], string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

/**
 * Build the deterministic file name for a generated image:
 * `image-<digest>.<ext>` for canonical SHA-256 IDs (and the historical
 * eight-character prefix for legacy IDs). The digest comes from the
 * content-addressed attachment id, so the same image bytes always map to the
 * same file name regardless of when they were generated, and re-saving simply
 * overwrites the previous copy in place.
 * @param attachmentId - durable attachment id (`sha256:<hex>`).
 * @param mediaType - verified image media type.
 * @returns the file name (no directory).
 */
export function workspaceImageName(
  attachmentId: string,
  mediaType: ImageAttachmentRef['mediaType'],
): string {
  const extension = EXTENSION[mediaType]
  if (extension === undefined) throw new Error(`unsupported image media type '${String(mediaType)}'`)
  const digest = attachmentId.startsWith('sha256:') ? attachmentId.slice('sha256:'.length) : attachmentId
  if (!/^[0-9a-f]+$/i.test(digest) || digest.length > 128) {
    throw new Error('attachmentId must contain a hexadecimal digest')
  }
  // New canonical SHA-256 IDs get a full digest filename to avoid 32-bit
  // prefix collisions. Short/bare legacy IDs retain the eight-character name
  // so existing workspace files remain addressable by compatibility helpers.
  const prefix = /^sha256:[0-9a-f]{64}$/i.test(attachmentId)
    ? digest
    : digest.slice(0, 8).padEnd(8, '0')
  return `image-${prefix}.${extension}`
}

/**
 * Resolve the configured image folder inside the session workspace. The
 * folder may nest, but must stay inside the workspace: absolute paths and
 * parent-traversal segments are rejected for both separator styles.
 *
 * This lexical pass is necessary but not sufficient: `saveImageToWorkspace`
 * additionally verifies the on-disk resolution so symlinked folders cannot
 * escape the workspace.
 * @param workspaceRoot - the session workspace directory.
 * @param folder - configured subfolder; empty/blank means the workspace root.
 * @returns the absolute image directory.
 * @throws when the folder would escape the workspace root.
 */
export function workspaceImageDir(workspaceRoot: string, folder: string | undefined): string {
  const trimmed = (folder ?? '').trim()
  const root = resolve(workspaceRoot)
  const normalized = trimmed.replace(/\\/g, '/')
  if (normalized.includes('\0') || isAnyAbsolutePath(trimmed) || normalized.split('/').some(segment => segment === '..')) {
    throw new Error(`image workspace folder '${folder}' must stay inside the session workspace`)
  }
  // Normalize both separator styles before resolving so a POSIX host cannot
  // treat `..\\escape` as a harmless filename.
  const dir = normalized === '' ? root : resolve(root, normalized)
  if (!containsPath(root, dir)) {
    throw new Error(`image workspace folder '${folder}' must stay inside the session workspace`)
  }
  return dir
}

/** Detect POSIX and Windows absolute-path spellings on every host OS. */
function isAnyAbsolutePath(value: string): boolean {
  return isAbsolute(value) || /^[/\\]/u.test(value) || /^[A-Za-z]:/u.test(value)
}

function isAbsoluteWorkspacePath(value: string): boolean {
  return isAbsolute(value) || /^[/\\]/u.test(value) || /^[A-Za-z]:[/\\]/u.test(value)
}

function reserveHashBytes(size: number, budget?: { remaining: number }): boolean {
  if (budget === undefined) return true
  if (!Number.isSafeInteger(size) || size < 0 || !Number.isFinite(budget.remaining) || budget.remaining < size) return false
  budget.remaining -= size
  return true
}

/** True when `child` equals `parent` or lives underneath it (lexically). */
function containsPath(parent: string, child: string): boolean {
  const rel = relative(parent, child)
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))
}

/**
 * Real path of the closest existing ancestor of `dir` (inclusive). Walking up
 * lets us validate symlinked folder segments before creating anything under
 * them.
 */
async function nearestExistingRealPath(dir: string): Promise<string> {
  let probe = dir
  for (;;) {
    try {
      return await realpath(probe)
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') throw error
      const parent = dirname(probe)
      if (parent === probe) throw error // reached the filesystem root
      probe = parent
    }
  }
}

/** Reject a directory whose on-disk resolution lands outside the workspace. */
function assertInsideWorkspace(realRoot: string, candidate: string, folder: string | undefined): void {
  if (containsPath(realRoot, candidate)) return
  throw new Error(`image workspace folder '${folder ?? ''}' must stay inside the session workspace (${candidate} resolves outside ${realRoot})`)
}

/**
 * Write one generated image durably under the session workspace.
 *
 * Containment is enforced twice: lexically by `workspaceImageDir`, then
 * against real paths, so a configured folder (or any intermediate segment)
 * that is a symlink pointing outside the workspace is rejected before and
 * after anything is created.
 *
 * The bytes are written to a same-directory staging file and renamed onto the
 * target, so a crash never leaves a half-written image under its final name.
 * Re-saving identical bytes rewrites the same file (the name is content-
 * addressed), which keeps repeated generations idempotent. A cancellation is
 * honoured up to and including the final rename: an aborted save never
 * resolves successfully and never leaves the image behind under its final
 * name.
 * @param options - workspace root, configured folder, attachment identity, and image bytes.
 * @returns the absolute path of the written file.
 */
export async function saveImageToWorkspace(options: {
  workspaceRoot: string
  folder?: string | undefined
  attachmentId: string
  mediaType: ImageAttachmentRef['mediaType']
  data: Uint8Array
  signal?: AbortSignal
}): Promise<string> {
  const dir = workspaceImageDir(options.workspaceRoot, options.folder)
  options.signal?.throwIfAborted()
  const realRoot = await realpath(resolve(options.workspaceRoot))
  assertInsideWorkspace(realRoot, await nearestExistingRealPath(dir), options.folder)
  const name = workspaceImageName(options.attachmentId, options.mediaType)
  await mkdir(dir, { recursive: true })
  // Write through the canonical directory, not the lexical path. If an
  // intermediate link is swapped after validation, bytes still stay under the
  // already-proven workspace root.
  const realDir = await realpath(dir)
  assertInsideWorkspace(realRoot, realDir, options.folder)
  const target = join(realDir, name)
  const returnedTarget = join(dir, name)
  const staging = join(realDir, `.${name}.${process.pid}-${randomUUID()}.tmp`)
  const backup = join(realDir, `.${name}.${process.pid}-${randomUUID()}.bak`)
  let backedUp = false

  try {
    options.signal?.throwIfAborted()
    try {
      const existing = await lstat(target)
      if (existing.isSymbolicLink() || !existing.isFile()) throw new Error(`generated image target '${returnedTarget}' is not a regular file`)
      await rename(target, backup)
      backedUp = true
      options.signal?.throwIfAborted()
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') throw error
    }

    await writeFile(staging, options.data, { flag: 'wx', signal: options.signal })
    options.signal?.throwIfAborted()
    await rename(staging, target)
    try {
      options.signal?.throwIfAborted()
    } catch (error) {
      // Restore an earlier valid target instead of deleting it when cancellation
      // lands during the final rename window.
      await unlink(target).catch(() => {})
      if (backedUp) {
        await rename(backup, target).catch(() => {})
        backedUp = false
      }
      throw error
    }
    if (backedUp) {
      await unlink(backup).catch(() => {})
      backedUp = false
    }
    if (/^sha256:[0-9a-f]{64}$/i.test(options.attachmentId)) {
      await removeMatchingLegacyFile(realDir, options.attachmentId, extensionOf(options.mediaType))
    }
    return returnedTarget
  } catch (error) {
    await unlink(staging).catch(() => {})
    if (backedUp) {
      await unlink(target).catch(() => {})
      await rename(backup, target).catch(() => {})
    }
    throw error
  }
}

function extensionOf(mediaType: ImageAttachmentRef['mediaType']): string {
  return EXTENSION[mediaType]
}

/** Remove a legacy eight-character file only when its bytes prove the same SHA-256. */
async function removeMatchingLegacyFile(directory: string, attachmentId: string, extension: string): Promise<void> {
  const digest = attachmentId.slice('sha256:'.length).toLowerCase()
  const legacy = join(directory, `image-${digest.slice(0, 8)}.${extension}`)
  if (legacy === join(directory, `image-${digest}.${extension}`)) return
  try {
    const file = await lstat(legacy)
    if (file.isSymbolicLink() || !file.isFile() || file.size > 16 * 1024 * 1024) return
    const data = await readFile(legacy)
    if (createHash('sha256').update(data).digest('hex') !== digest) return
    await unlink(legacy)
  } catch {
    /* Legacy cleanup is best effort and never invalidates a successful save. */
  }
}

/** A workspace row persisted in DSH's local workspace table. */
export interface DshWorkspaceInfo {
  workspaceId: string
  path: string
  title: string
  sessionIds: string[]
}

/** Strictly generated image names accepted by the deletion helpers. */
const GENERATED_IMAGE_NAME_REGEX = /^image-(?:[0-9a-f]{8}|[0-9a-f]{64})\.(png|jpg|jpeg|webp|gif)$/i
const CANONICAL_GENERATED_IMAGE_NAME_REGEX = /^image-([0-9a-f]{64})\.(png|jpg|jpeg|webp|gif)$/i
const MAX_HASH_VERIFY_BYTES = 64 * 1024 * 1024
const ATTACHMENT_ID_REGEX = /^sha256:([0-9a-f]{64})$/i
const DEFAULT_WORKSPACE_IMAGE_FOLDER = 'dsh-image-gen'
const GENERATED_IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'gif'] as const
const MAX_WORKSPACE_STORAGE_BYTES = 1 * 1024 * 1024
const MAX_WORKSPACE_ROWS = 256
const MAX_WORKSPACE_PATH_LENGTH = 4096
const MAX_SESSION_IDS = 256

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Resolve the storage file without importing any workspace/provider architecture. */
function dshWorkspaceStoragePath(): string | undefined {
  const home = process.env.USERPROFILE || process.env.HOME || ''
  return typeof home === 'string' && home.trim() !== ''
    ? join(home, '.dsh', 'storages', 'workspace.json')
    : undefined
}

/** Read valid workspace rows from local DSH storage; malformed storage is treated as empty. */
async function readDshWorkspaceRows(): Promise<Array<[string, Record<string, unknown>]>> {
  const storagePath = dshWorkspaceStoragePath()
  if (storagePath === undefined) return []

  try {
    const info = await lstat(storagePath)
    if (info.isSymbolicLink() || !info.isFile() || info.size > MAX_WORKSPACE_STORAGE_BYTES) return []
    const parsed: unknown = JSON.parse(await readFile(storagePath, 'utf8'))
    const tables = isRecord(parsed) ? parsed.tables : undefined
    const workspaces = isRecord(tables) ? tables.workspaces : undefined
    if (!isRecord(workspaces)) return []

    const rows: Array<[string, Record<string, unknown>]> = []
    for (const [workspaceId, value] of Object.entries(workspaces).slice(0, MAX_WORKSPACE_ROWS)) {
      if (workspaceId.length <= 256 && isRecord(value)) rows.push([workspaceId, value])
    }
    return rows
  } catch {
    return []
  }
}

/** Discover all workspace paths currently recorded in ~/.dsh/storages/workspace.json. */
export async function getDshWorkspaceRoots(): Promise<string[]> {
  const roots: string[] = []
  const seen = new Set<string>()
  for (const [, row] of await readDshWorkspaceRows()) {
    if (typeof row.path !== 'string') continue
    const path = row.path.trim()
    if (!isAbsoluteWorkspacePath(path) || path.length > MAX_WORKSPACE_PATH_LENGTH || seen.has(path)) continue
    seen.add(path)
    roots.push(path)
  }
  return roots
}

/** Discover detailed workspace records without exposing provider or credential state. */
export async function getDshWorkspacesFull(): Promise<DshWorkspaceInfo[]> {
  const workspaces: DshWorkspaceInfo[] = []
  for (const [workspaceId, row] of await readDshWorkspaceRows()) {
    if (typeof row.path !== 'string') continue
    const path = row.path.trim()
    if (!isAbsoluteWorkspacePath(path) || path.length > MAX_WORKSPACE_PATH_LENGTH) continue

    const title = typeof row.title === 'string' && row.title.trim() !== ''
      ? row.title.trim().slice(0, 256)
      : basename(path)
    const sessionIds = Array.isArray(row.sessionIds)
      ? row.sessionIds.filter((value): value is string => typeof value === 'string' && value.length <= 256).slice(0, MAX_SESSION_IDS)
      : []
    workspaces.push({ workspaceId, path, title, sessionIds })
  }
  return workspaces
}

/**
 * Resolve a candidate path and prove that it is inside one of the caller's
 * explicitly supplied workspace roots. No implicit process.cwd() root is used.
 */
export async function assertWorkspaceAllowed(
  candidateRoot: string,
  allowedRoots: Iterable<string>,
): Promise<string> {
  if (typeof candidateRoot !== 'string' || candidateRoot.trim() === '' || !isAbsoluteWorkspacePath(candidateRoot.trim())) {
    throw new Error(`Directory '${candidateRoot}' is not within an allowed DSH workspace`)
  }

  const realCandidate = await realpath(resolve(candidateRoot))
  const realRoots = await canonicalWorkspaceRoots(allowedRoots)
  if (realRoots.some(root => containsPath(root, realCandidate))) return realCandidate
  throw new Error(`Directory '${candidateRoot}' is not within an allowed DSH workspace`)
}

/** Canonicalize caller-supplied roots for containment checks. */
async function canonicalWorkspaceRoots(roots: Iterable<string> | undefined): Promise<string[]> {
  if (roots === undefined) return []
  const values = typeof roots === 'string' ? [roots] : roots
  const canonical: string[] = []
  const seen = new Set<string>()
  for (const value of values) {
    if (typeof value !== 'string' || value.trim() === '' || !isAbsoluteWorkspacePath(value.trim())) continue
    try {
      const root = await realpath(resolve(value.trim()))
      if (!seen.has(root)) {
        seen.add(root)
        canonical.push(root)
      }
    } catch {
      // A stale workspace record must not authorize a deletion elsewhere.
    }
  }
  return canonical
}

/** Safely delete one generated image file under explicitly allowed roots. */
export async function deleteImageFromWorkspace(
  filePath: string,
  allowedWorkspaceRoots?: Iterable<string>,
  options: { allowLegacy?: boolean; expectedAttachmentId?: string; hashBudget?: { remaining: number } } = {},
): Promise<boolean> {
  if (typeof filePath !== 'string' || filePath.trim() === '' || !isAbsoluteWorkspacePath(filePath.trim())) return false

  const resolved = resolve(filePath)
  const fileName = basename(resolved)
  if (!GENERATED_IMAGE_NAME_REGEX.test(fileName)) return false
  if (options.allowLegacy !== true && !CANONICAL_GENERATED_IMAGE_NAME_REGEX.test(fileName)) return false

  try {
    const file = await lstat(resolved)
    if (file.isSymbolicLink() || !file.isFile()) return false
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') return true
    throw error
  }

  // Use the canonical path for both the containment proof and the unlink. If
  // an attacker swaps a parent symlink after this point, the old canonical
  // path is still the only path that can be removed.
  let realFile: string
  try {
    realFile = await realpath(resolved)
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') return true
    throw error
  }
  if (!GENERATED_IMAGE_NAME_REGEX.test(basename(realFile))) return false

  const realRoots = await canonicalWorkspaceRoots(allowedWorkspaceRoots)
  if (!realRoots.some(root => containsPath(root, realFile))) return false

  // Re-check the leaf immediately before unlinking so a direct symlink swap is
  // rejected rather than followed. The canonical unlink remains race-safe for
  // parent-directory swaps.
  try {
    const file = await lstat(resolved)
    if (file.isSymbolicLink() || !file.isFile()) return false
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') return true
    throw error
  }

  const canonicalMatch = CANONICAL_GENERATED_IMAGE_NAME_REGEX.exec(basename(realFile))
  const expectedDigest = typeof options.expectedAttachmentId === 'string' ? ATTACHMENT_ID_REGEX.exec(options.expectedAttachmentId)?.[1]?.toLowerCase() : undefined
  if (canonicalMatch === null && expectedDigest !== undefined) {
    const verified = await lstat(realFile)
    if (!verified.isFile() || verified.size > MAX_HASH_VERIFY_BYTES || !reserveHashBytes(verified.size, options.hashBudget)) return false
    const digest = createHash('sha256').update(await readFile(realFile)).digest('hex')
    if (digest !== expectedDigest) return false
  }
  if (canonicalMatch?.[1] !== undefined) {
    const verified = await lstat(realFile)
    if (!verified.isFile() || verified.size > MAX_HASH_VERIFY_BYTES || !reserveHashBytes(verified.size, options.hashBudget)) return false
    const digest = createHash('sha256').update(await readFile(realFile)).digest('hex')
    if (digest !== canonicalMatch[1].toLowerCase()) return false
  }

  try {
    await unlink(realFile)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') return true
    throw error
  }
}

/**
 * Safely find and delete generated image files for one strict SHA-256
 * attachment id. Search is restricted to the requested root/folder or to the
 * known legacy image folders when no folder is supplied; it never adds cwd or
 * any other write root implicitly.
 */
export async function deleteImageByAttachmentIdFromWorkspace(
  attachmentId: string,
  options: {
    workspaceRoot?: string | undefined
    folder?: string | undefined
    allowedWorkspaceRoots?: Iterable<string> | undefined
  } = {},
): Promise<boolean> {
  const match = typeof attachmentId === 'string' ? ATTACHMENT_ID_REGEX.exec(attachmentId) : null
  if (match === null || match[1] === undefined) return false

  const workspaceRoot = typeof options.workspaceRoot === 'string' && options.workspaceRoot.trim() !== ''
    ? resolve(options.workspaceRoot.trim())
    : undefined
  const suppliedRoots = options.allowedWorkspaceRoots === undefined
    ? undefined
    : (typeof options.allowedWorkspaceRoots === 'string'
      ? [options.allowedWorkspaceRoots]
      : Array.from(options.allowedWorkspaceRoots))
  const searchRoots = workspaceRoot === undefined
    ? (suppliedRoots ?? []).filter((root): root is string => typeof root === 'string' && root.trim() !== '').map(root => resolve(root.trim()))
    : [workspaceRoot]
  const authorizationRoots = suppliedRoots ?? (workspaceRoot === undefined ? [] : [workspaceRoot])
  if (searchRoots.length === 0 || authorizationRoots.length === 0) return false

  const prefixes = new Set([
    match[1],
    match[1].toLowerCase(),
    match[1].slice(0, 8),
    match[1].slice(0, 8).toLowerCase(),
  ])
  let deleted = false

  for (const root of searchRoots) {
    const folders: string[] = []
    if (options.folder !== undefined) {
      try {
        folders.push(workspaceImageDir(root, options.folder))
      } catch {
        // Invalid folders are never allowed to fall back to a broader search.
        continue
      }
    } else {
      folders.push(
        join(root, DEFAULT_WORKSPACE_IMAGE_FOLDER),
        join(root, 'image'),
        join(root, 'images'),
        root,
      )
    }

    for (const folder of new Set(folders)) {
      for (const prefix of prefixes) {
        for (const extension of GENERATED_IMAGE_EXTENSIONS) {
          const candidate = join(folder, `image-${prefix}.${extension}`)
          let file: Awaited<ReturnType<typeof lstat>>
          try {
            file = await lstat(candidate)
          } catch (error) {
            if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') continue
            throw error
          }
          if (file.isSymbolicLink() || !file.isFile()) continue
          if (await deleteImageFromWorkspace(candidate, authorizationRoots, { allowLegacy: true, expectedAttachmentId: attachmentId })) deleted = true
        }
      }
    }
  }

  return deleted
}
