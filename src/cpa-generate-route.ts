/** Same-origin CPA-only generation route used by provider-independent Gallery actions. */
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import type { CpaGeneratedImage, CpaImageGenerationRequest, CpaImageGenerationService } from './cpa-contract.js'
import { gptSizeFromAspectRatio, normalizeGeminiAspectRatio, normalizeGeminiImageSize, normalizeGptSize, outputLabel } from './engine-options.js'
import { assertWorkspaceAllowed } from './workspace-save.js'
import { CPA_GENERATE_ROUTE, attachmentMeta } from './shared.js'

const MAX_BODY_BYTES = 32 * 1024
const MAX_PROMPT_LENGTH = 16_000
const CPA_GENERATE_TIMEOUT_MS = 120_000
const SUPPORTED_MEDIA_TYPES = new Set<ImageAttachmentRef['mediaType']>(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
const GENERATE_INPUT_KEYS = new Set(['engine', 'model', 'prompt', 'size', 'aspect_ratio', 'image_size'])

export { CPA_GENERATE_ROUTE } from './shared.js'

export interface CpaGenerateRouteDeps {
  getService(): CpaImageGenerationService | undefined
  /** Resolve the configured model when a browser regeneration only names an engine. */
  getDefaultModel?(engine: GenerateInput['engine']): string | undefined
  saveImage(input: { data: Uint8Array; mediaType: ImageAttachmentRef['mediaType']; name?: string }): Promise<ImageAttachmentRef>
  /** Read the normalized attachment bytes for a workspace copy. */
  readImage?(ref: ImageAttachmentRef, signal?: AbortSignal): Promise<{ ref: ImageAttachmentRef; data: Uint8Array }>
  /** Optional session-scoped workspace persistence; never accepts arbitrary roots. */
  getWorkspaceOptions?(): { enabled: boolean; folder?: string | undefined; activeRoot?: string | undefined }
  getAllowedWorkspaceRoots?(): Promise<Iterable<string>> | Iterable<string>
  saveToWorkspace?(options: { workspaceRoot: string; folder?: string | undefined; attachmentId: string; mediaType: ImageAttachmentRef['mediaType']; data: Uint8Array; signal: AbortSignal }): Promise<string>
  maxImageBytes: number
  mediaTypes: readonly string[]
}

interface GenerateInput {
  engine: 'gpt' | 'gemini'
  model?: string
  prompt: string
  size?: string
  aspectRatio?: string
  imageSize?: string
}

/** Handle a browser-initiated CPA generation without exposing credentials. */
export async function serveCpaGenerate(req: IncomingMessage, res: ServerResponse, deps: CpaGenerateRouteDeps): Promise<void> {
  if (req.method !== 'POST') return jsonError(res, 405, 'method-not-allowed')
  if (!sameOrigin(req)) return jsonError(res, 403, 'origin-rejected')
  if (!(req.headers['content-type'] ?? '').toLowerCase().startsWith('application/json')) return jsonError(res, 415, 'json-required')

  let body: unknown
  try {
    body = JSON.parse(await readBody(req))
  } catch {
    return jsonError(res, 400, 'invalid-request')
  }
  const input = parseInput(body)
  if (input === undefined) return jsonError(res, 400, 'invalid-generation-request')
  const service = deps.getService()
  if (service === undefined || service === null || typeof service !== 'object' || typeof service.generate !== 'function') return jsonError(res, 503, 'image-service-unavailable')

  const requestedModel = input.model ?? deps.getDefaultModel?.(input.engine)
  const modelAware = typeof service.listModels === 'function'
  const serviceModel = modelAware ? requestedModel : undefined
  const controller = new AbortController()
  let clientAborted = false
  let timedOut = false
  const timeout = setTimeout(() => { timedOut = true; controller.abort() }, CPA_GENERATE_TIMEOUT_MS)
  const onClose = () => { clientAborted = true; controller.abort() }
  req.once?.('close', onClose)
  try {
    const generated = await service.generate({
      engine: input.engine,
      ...(serviceModel === undefined ? {} : { model: serviceModel }),
      prompt: input.prompt,
      ...(input.engine === 'gpt'
        ? { size: input.size ?? '1024x1024' }
        : {
            ...(input.aspectRatio === undefined ? {} : { aspectRatio: input.aspectRatio }),
            ...(input.imageSize === undefined ? {} : { imageSize: input.imageSize }),
          }),
      signal: controller.signal,
    } satisfies CpaImageGenerationRequest)
    assertImageResult(generated, deps)
    controller.signal.throwIfAborted()
    const attachment = await deps.saveImage({ data: generated.data, mediaType: generated.mediaType, name: 'generated-image' })
    controller.signal.throwIfAborted()
    let savedTo: string | undefined
    let saveError: string | undefined
    const resolvedModel = typeof generated.model === 'string' ? generated.model : serviceModel
    const workspace = deps.getWorkspaceOptions?.()
    if (workspace?.enabled && deps.saveToWorkspace !== undefined && deps.readImage !== undefined) {
      const requestedRoot = workspace.activeRoot
      if (requestedRoot !== undefined) {
        try {
          const allowedRoots = deps.getAllowedWorkspaceRoots?.() ?? []
          const workspaceRoot = await assertWorkspaceAllowed(requestedRoot, await allowedRoots)
          const stored = await deps.readImage(attachment, controller.signal)
          savedTo = await deps.saveToWorkspace({
            workspaceRoot,
            folder: workspace.folder,
            attachmentId: stored.ref.attachmentId,
            mediaType: stored.ref.mediaType,
            data: stored.data,
            signal: controller.signal,
          })
        } catch (error) {
          controller.signal.throwIfAborted()
          void error
          saveError = 'workspace-save-failed'
        }
      }
    }
    controller.signal.throwIfAborted()
    return json(res, 200, {
      attachment: attachmentMeta(attachment),
      engine: input.engine,
      ...(resolvedModel === undefined ? {} : { model: resolvedModel }),
      output: outputLabel({ engine: input.engine, size: input.size, aspectRatio: input.aspectRatio, imageSize: input.imageSize }),
      ...(input.aspectRatio === undefined ? {} : { aspectRatio: input.aspectRatio }),
      ...(input.imageSize === undefined ? {} : { imageSize: input.imageSize }),
      ...(savedTo === undefined ? {} : { savedTo }),
      ...(saveError === undefined ? {} : { saveError }),
      createdAt: Math.floor(Date.now() / 1000) * 1000,
    })
  } catch (error) {
    if (clientAborted && !timedOut) return jsonError(res, 499, 'aborted')
    if (timedOut) return jsonError(res, 504, 'generation-timeout')
    if (isAbortError(error)) return jsonError(res, 499, 'aborted')
    return jsonError(res, 502, 'generation-failed')
  } finally {
    clearTimeout(timeout)
    req.removeListener?.('close', onClose)
  }
}

function parseInput(value: unknown): GenerateInput | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const root = value as Record<string, unknown>
  if (root.engine !== 'gpt' && root.engine !== 'gemini') return undefined
  if (Object.keys(root).some((key) => !GENERATE_INPUT_KEYS.has(key))) return undefined
  if (typeof root.prompt !== 'string') return undefined
  const prompt = root.prompt.trim()
  const model = root.model === undefined ? undefined : typeof root.model === 'string' ? root.model.trim() : undefined
  if (prompt.length === 0 || prompt.length > MAX_PROMPT_LENGTH || root.workspaceRoot !== undefined) return undefined
  if (root.model !== undefined && (model === undefined || model.length === 0 || model.length > 256)) return undefined

  if (root.engine === 'gpt') {
    const size = normalizeGptSize(root.size) ?? gptSizeFromAspectRatio(typeof root.aspect_ratio === 'string' ? root.aspect_ratio : undefined) ?? '1024x1024'
    return { engine: 'gpt', ...(model === undefined ? {} : { model }), prompt, size }
  }
  const aspectRatio = normalizeGeminiAspectRatio(root.aspect_ratio)
  const imageSize = normalizeGeminiImageSize(root.image_size)
  return {
    engine: 'gemini',
    ...(model === undefined ? {} : { model }),
    prompt,
    ...(aspectRatio === undefined ? {} : { aspectRatio }),
    ...(imageSize === undefined ? {} : { imageSize }),
  }
}

function assertImageResult(value: CpaGeneratedImage, deps: CpaGenerateRouteDeps): void {
  if (!(value.data instanceof Uint8Array) || value.data.byteLength === 0 || !Number.isFinite(deps.maxImageBytes) || deps.maxImageBytes <= 0 || value.data.byteLength > deps.maxImageBytes) {
    throw new Error('CPA image service returned invalid image data')
  }
  if (!SUPPORTED_MEDIA_TYPES.has(value.mediaType) || deps.mediaTypes.length === 0 || !deps.mediaTypes.includes(value.mediaType)) {
    throw new Error(`This DSH deployment does not accept ${String(value.mediaType)} generated images`)
  }
}

function sameOrigin(req: IncomingMessage): boolean {
  const origin = req.headers.origin
  const host = req.headers.host
  if (origin === undefined) return true
  if (host === undefined) return false
  return origin === `http://${host}` || origin === `https://${host}`
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  let bytes = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    bytes += buffer.byteLength
    if (bytes > MAX_BODY_BYTES) throw new Error('request-too-large')
    chunks.push(buffer)
  }
  return Buffer.concat(chunks).toString('utf8')
}

function isAbortError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === 'ABORTED'
}

function json(res: ServerResponse, status: number, value: unknown): void {
  if (res.headersSent || res.writableEnded || res.destroyed) return
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' })
  res.end(JSON.stringify(value))
}

function jsonError(res: ServerResponse, status: number, error: string): void {
  json(res, status, { error })
}
