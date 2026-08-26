/** Same-origin HTTP bridge from the Web result card to the Attachment service. */
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { ImageAttachmentRef, StoredImageAttachment } from '@deepseek-ai/dsh-attachment'
import sharp from 'sharp'
import { IMAGE_ROUTE } from './shared.js'

export { IMAGE_ROUTE } from './shared.js'
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
  readImage(ref: ImageAttachmentRef): Promise<StoredImageAttachment>
}

/** Parsed route request body (post JSON parsing + validation). */
export interface ImageRequest {
  attachment: ImageAttachmentRef
  kind: ImageRequestKind
  thumbWidth: number
}

/**
 * Validate the persisted reference carried by a tool presentation. Shared with
 * the client so the request body shape stays in one place.
 */
export function imageAttachmentFromMeta(meta: unknown): ImageAttachmentRef | undefined {
  const value = record(meta)
  if (value?.kind !== 'dsh-image-gen') return undefined
  return imageAttachment(value.attachment)
}

/** Serve one verified durable image reference to a same-origin browser request. */
export async function serveImage(req: IncomingMessage, res: ServerResponse, deps: ImageRouteDeps): Promise<void> {
  if (req.method !== 'POST') return jsonError(res, 405, 'method-not-allowed')
  if (!(req.headers['content-type'] ?? '').toLowerCase().startsWith('application/json')) return jsonError(res, 415, 'json-required')
  const origin = req.headers.origin
  const host = req.headers.host
  if (origin !== undefined && host !== undefined && origin !== `http://${host}` && origin !== `https://${host}`) {
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
  try {
    const stored = await deps.readImage(request.attachment)
    if (request.kind === 'thumb') {
      const thumb = await renderThumbnail(stored, request.thumbWidth)
      res.writeHead(200, {
        'content-type': 'image/webp',
        'content-length': String(thumb.byteLength),
        'cache-control': `public, max-age=${THUMB_CACHE_MAX_AGE}, immutable`,
        'x-content-type-options': 'nosniff',
      })
      res.end(thumb)
      return
    }
    res.writeHead(200, {
      'content-type': stored.ref.mediaType,
      'content-length': String(stored.data.byteLength),
      'cache-control': `private, max-age=${FULL_CACHE_MAX_AGE}`,
      'x-content-type-options': 'nosniff',
    })
    res.end(stored.data)
  } catch {
    jsonError(res, 404, 'image-unavailable')
  }
}

/**
 * Decode a stored image and produce a downscaled WebP thumbnail. GIFs are
 * flattened to their first frame (sharp has no animated output here), and the
 * image is never upscaled beyond its intrinsic size.
 */
export async function renderThumbnail(stored: StoredImageAttachment, width: number): Promise<Buffer> {
  const target = clampThumbWidth(width)
  return sharp(stored.data, { failOn: 'error', limitInputPixels: false })
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
  const kind = root.kind === 'thumb' ? 'thumb' : 'full'
  const rawWidth = typeof root.thumbWidth === 'number' ? root.thumbWidth : DEFAULT_THUMB_WIDTH
  return { attachment, kind, thumbWidth: clampThumbWidth(rawWidth) }
}

function imageAttachment(value: unknown): ImageAttachmentRef | undefined {
  const ref = record(value)
  if (ref === undefined) return undefined
  if (typeof ref.attachmentId !== 'string' || !mediaType(ref.mediaType) || typeof ref.bytes !== 'number' || typeof ref.width !== 'number' || typeof ref.height !== 'number') return undefined
  if (ref.name !== undefined && typeof ref.name !== 'string') return undefined
  return ref as unknown as ImageAttachmentRef
}

function mediaType(value: unknown): value is ImageAttachmentRef['mediaType'] {
  return value === 'image/png' || value === 'image/jpeg' || value === 'image/webp' || value === 'image/gif'
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined
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
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' })
  res.end(JSON.stringify({ error: code }))
}
