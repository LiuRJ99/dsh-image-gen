/** Same-origin HTTP bridge from the Web result card to the Attachment service. */
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { ImageAttachmentRef, StoredImageAttachment } from '@deepseek-ai/dsh-attachment'
import sharp from 'sharp'
import { DELETE_ROUTE, IMAGE_ROUTE, WORKSPACES_ROUTE, imageAttachment, imageAttachmentFromMeta, record } from './shared.js'

export { IMAGE_ROUTE, imageAttachmentFromMeta } from './shared.js'
const MAX_BODY_BYTES = 4096

/** Default thumbnail width in pixels when the browser asks for a thumbnail. */
export const DEFAULT_THUMB_WIDTH = 300
/** Thumbnail encode quality (0–100) for the WebP output. */
export const THUMB_QUALITY = 70
/** Upper bound a client may request for a thumbnail width; larger requests are clamped. */
export const MAX_THUMB_WIDTH = 1024
/** Short private cache window for the full-resolution response (seconds). */
export const FULL_CACHE_MAX_AGE = 300
/** Long immutable cache window for content-addressed thumbnails (seconds). */
export const THUMB_CACHE_MAX_AGE = 604800

/** What the browser wants from the route. Defaults to the full image. */
export type ImageRequestKind = 'full' | 'thumb'

/** Dependencies required by the image route. */
export interface ImageRouteDeps {
  readImage(ref: ImageAttachmentRef, signal?: AbortSignal): Promise<StoredImageAttachment>
}

/** Parsed route request body (post JSON parsing + validation). */
export interface ImageRequest {
  attachment: ImageAttachmentRef
  kind: ImageRequestKind
  thumbWidth: number
}

/** Serve one verified durable image reference to a same-origin browser request. */
export async function serveImage(req: IncomingMessage, res: ServerResponse, deps: ImageRouteDeps): Promise<void> {
  if (req.method !== 'POST') return jsonError(res, 405, 'method-not-allowed')
  if (!(req.headers['content-type'] ?? '').toLowerCase().startsWith('application/json')) return jsonError(res, 415, 'json-required')
  const origin = req.headers.origin
  const host = req.headers.host
  if (origin !== undefined && (host === undefined || (origin !== `http://${host}` && origin !== `https://${host}`))) {
    return jsonError(res, 403, 'origin-rejected')
  }
  let body: unknown
  try {
    body = JSON.parse(await readBody(req))
  } catch {
    return jsonError(res, 400, 'invalid-request')
  }
  const request = imageRequestFromBody(body)
  if (request === undefined) return jsonError(res, 400, 'invalid-attachment')
  const controller = new AbortController()
  const onClose = () => controller.abort()
  req.once?.('close', onClose)
  try {
    const stored = await deps.readImage(request.attachment, controller.signal)
    if (request.kind === 'thumb') {
      const thumb = await renderThumbnail(stored, request.thumbWidth)
      if (res.headersSent || res.writableEnded || res.destroyed) return
      res.writeHead(200, {
        'content-type': 'image/webp',
        'content-length': String(thumb.byteLength),
        'cache-control': `public, max-age=${THUMB_CACHE_MAX_AGE}, immutable`,
        'x-content-type-options': 'nosniff',
      })
      res.end(thumb)
      return
    }
    if (res.headersSent || res.writableEnded || res.destroyed) return
    res.writeHead(200, {
      'content-type': stored.ref.mediaType,
      'content-length': String(stored.data.byteLength),
      'cache-control': `private, max-age=${FULL_CACHE_MAX_AGE}`,
      'x-content-type-options': 'nosniff',
    })
    res.end(stored.data)
  } catch {
    if (!controller.signal.aborted) jsonError(res, 404, 'image-unavailable')
  } finally {
    req.removeListener?.('close', onClose)
  }
}

/**
 * Decode a stored image and produce a downscaled WebP thumbnail. GIFs are
 * flattened to their first frame (sharp has no animated output here), and the
 * image is never upscaled beyond its intrinsic size.
 */
export async function renderThumbnail(stored: StoredImageAttachment, width: number): Promise<Buffer> {
  const target = clampThumbWidth(width)
  return sharp(stored.data, { failOn: 'error', limitInputPixels: 40_000_000 })
    .rotate()
    .resize({ width: target, withoutEnlargement: true })
    .webp({ quality: THUMB_QUALITY })
    .toBuffer()
}

/** Clamp a requested thumbnail width into the supported 1..MAX_THUMB_WIDTH range. */
export function clampThumbWidth(width: number): number {
  if (!Number.isFinite(width) || width <= 0) return DEFAULT_THUMB_WIDTH
  return Math.min(Math.floor(width), MAX_THUMB_WIDTH)
}

function imageRequestFromBody(value: unknown): ImageRequest | undefined {
  const root = record(value)
  if (root === undefined) return undefined
  const attachment = imageAttachment(root.attachment)
  if (attachment === undefined) return undefined
  const kind = root.kind === undefined || root.kind === 'full'
    ? 'full'
    : root.kind === 'thumb'
      ? 'thumb'
      : undefined
  if (kind === undefined) return undefined
  const rawWidth = typeof root.thumbWidth === 'number' ? root.thumbWidth : DEFAULT_THUMB_WIDTH
  return { attachment, kind, thumbWidth: clampThumbWidth(rawWidth) }
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  let bytes = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    bytes += buffer.byteLength
    if (bytes > MAX_BODY_BYTES) throw new Error('request too large')
    chunks.push(buffer)
  }
  return Buffer.concat(chunks).toString('utf8')
}

function jsonError(res: ServerResponse, status: number, code: string): void {
  if (res.headersSent || res.writableEnded || res.destroyed) return
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' })
  res.end(JSON.stringify({ error: code }))
}

/** Dependencies for the provider-independent Gallery cleanup route. */
export interface DeleteRouteDeps {
  deleteWorkspaceImage(filePath: string, options?: { hashBudget?: { remaining: number } }): Promise<boolean>
}

/** Dependencies for the read-only workspace discovery route. */
export interface WorkspacesRouteDeps {
  getWorkspaces(): Promise<unknown> | unknown
}

const DELETE_BODY_BYTES = 64 * 1024
const MAX_DELETE_ITEMS = 100
const MAX_DELETE_HASH_BYTES = 256 * 1024 * 1024
const CANONICAL_DELETE_NAME = /^image-[0-9a-f]{64}\.(?:png|jpg|jpeg|webp|gif)$/iu

function isCanonicalDeletePath(value: string): boolean {
  const normalized = value.replace(/\\/g, '/')
  if (!(normalized.startsWith('/') || /^[A-Za-z]:\//u.test(normalized))) return false
  return CANONICAL_DELETE_NAME.test(normalized.slice(normalized.lastIndexOf('/') + 1))
}

/** Delete only explicitly selected generated files; this route never writes files. */
export async function serveDelete(req: IncomingMessage, res: ServerResponse, deps: DeleteRouteDeps): Promise<void> {
  if (req.method !== 'POST') return jsonError(res, 405, 'method-not-allowed')
  if (!(req.headers['content-type'] ?? '').toLowerCase().startsWith('application/json')) return jsonError(res, 415, 'json-required')
  if (!sameOrigin(req)) return jsonError(res, 403, 'origin-rejected')

  let body: unknown
  try {
    body = JSON.parse(await readBodyLimited(req, DELETE_BODY_BYTES))
  } catch {
    return jsonError(res, 400, 'invalid-request')
  }
  const root = record(body)
  if (root !== undefined && Object.keys(root).some((key) => key !== 'paths')) return jsonError(res, 400, 'invalid-request')
  const rawPaths = Array.isArray(root?.paths) ? root.paths : []
  if (rawPaths.length > MAX_DELETE_ITEMS) return jsonError(res, 413, 'too-many-items')
  const hashBudget = { remaining: MAX_DELETE_HASH_BYTES }
  const deletedFiles: string[] = []
  const failedFiles: Array<{ path: string; error: string }> = []
  for (const rawPath of rawPaths) {
    if (typeof rawPath !== 'string' || rawPath.trim() === '' || rawPath.length > 4096 || !isCanonicalDeletePath(rawPath.trim())) {
      failedFiles.push({ path: String(rawPath), error: 'invalid-path' })
      continue
    }
    try {
      if (await deps.deleteWorkspaceImage(rawPath, { hashBudget })) deletedFiles.push(rawPath)
      else failedFiles.push({ path: rawPath, error: 'path-rejected' })
    } catch {
      failedFiles.push({ path: rawPath, error: 'delete-failed' })
    }
  }
  return json(res, 200, {
    ok: failedFiles.length === 0,
    deletedCount: deletedFiles.length,
    deletedFiles,
    failedFiles,
  })
}

/** Return discovered workspace metadata without exposing credentials or settings. */
export async function serveWorkspaces(req: IncomingMessage, res: ServerResponse, deps: WorkspacesRouteDeps): Promise<void> {
  if (req.method !== 'GET') return jsonError(res, 405, 'method-not-allowed')
  if (!sameOrigin(req)) return jsonError(res, 403, 'origin-rejected')
  try {
    return json(res, 200, { workspaces: await deps.getWorkspaces() })
  } catch {
    return json(res, 200, { workspaces: [] })
  }
}

function sameOrigin(req: IncomingMessage): boolean {
  const origin = req.headers.origin
  const host = req.headers.host
  if (origin === undefined) return true
  if (host === undefined) return false
  return origin === `http://${host}` || origin === `https://${host}`
}

async function readBodyLimited(req: IncomingMessage, maxBytes: number): Promise<string> {
  const chunks: Buffer[] = []
  let bytes = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    bytes += buffer.byteLength
    if (bytes > maxBytes) throw new Error('request too large')
    chunks.push(buffer)
  }
  return Buffer.concat(chunks).toString('utf8')
}

function json(res: ServerResponse, status: number, value: unknown): void {
  if (res.headersSent || res.writableEnded || res.destroyed) return
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' })
  res.end(JSON.stringify(value))
}
