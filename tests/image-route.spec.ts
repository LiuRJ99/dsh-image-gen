import type { ImageAttachmentRef, StoredImageAttachment } from '@deepseek-ai/dsh-attachment'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { describe, expect, it } from 'vitest'
import { clampThumbWidth, renderThumbnail, serveImage } from '../src/image-route.js'

const ref = (overrides: Partial<ImageAttachmentRef> = {}): ImageAttachmentRef => ({
  attachmentId: 'sha256:0123456789abcdef',
  mediaType: 'image/png',
  bytes: 82,
  width: 1,
  height: 1,
  ...overrides,
})

/** 1×1 red PNG. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

function makeRequest(body: string): IncomingMessage {
  return {
    method: 'POST',
    headers: { 'content-type': 'application/json', host: 'localhost:3080', origin: 'http://localhost:3080' },
    [Symbol.asyncIterator]: async function* () {
      yield body
    },
  } as unknown as IncomingMessage
}

function makeResponse() {
  const chunks: Buffer[] = []
  const res = {
    statusCode: 0,
    headers: {} as Record<string, string | number>,
    ended: false,
    body: () => Buffer.concat(chunks).toString(),
    writeHead(status: number, headers: Record<string, string | number>) {
      this.statusCode = status
      this.headers = headers
    },
    end(data: unknown) {
      this.ended = true
      if (data !== undefined) chunks.push(Buffer.isBuffer(data) ? data : Buffer.from(String(data)))
    },
  } as unknown as ServerResponse & { body(): string }
  return res
}

describe('serveImage', () => {
  const stored: StoredImageAttachment = { ref: ref(), data: PNG }

  it('serves the full image with private short cache', async () => {
    const deps = { readImage: async () => stored }
    const res = makeResponse()
    await serveImage(makeRequest(JSON.stringify({ attachment: stored.ref })), res as never, deps)
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toBe('image/png')
    expect(res.headers['cache-control']).toBe('private, max-age=300')
  })

  it('serves a WebP thumbnail with immutable cache', async () => {
    const deps = { readImage: async () => stored }
    const res = makeResponse()
    await serveImage(makeRequest(JSON.stringify({ attachment: stored.ref, kind: 'thumb', thumbWidth: 300 })), res as never, deps)
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toBe('image/webp')
    expect(res.headers['cache-control']).toBe('public, max-age=604800, immutable')
  })

  it('rejects a request without a valid attachment', async () => {
    const deps = { readImage: async () => stored }
    const res = makeResponse()
    await serveImage(makeRequest(JSON.stringify({ nope: true })), res as never, deps)
    expect(res.statusCode).toBe(400)
  })
})

describe('renderThumbnail', () => {
  it('produces a WebP buffer', async () => {
    const stored: StoredImageAttachment = { ref: ref({ mediaType: 'image/png' }), data: PNG }
    const thumb = await renderThumbnail(stored, 300)
    expect(thumb.byteLength).toBeGreaterThan(0)
    expect(thumb.subarray(0, 4).toString()).toBe('RIFF') // WebP RIFF header
  })
})

describe('clampThumbWidth', () => {
  it('clamps to the default for non-positive input', () => {
    expect(clampThumbWidth(0)).toBe(300)
    expect(clampThumbWidth(-5)).toBe(300)
    expect(clampThumbWidth(Number.NaN)).toBe(300)
  })
  it('clamps oversized values', () => {
    expect(clampThumbWidth(9999)).toBe(1024)
  })
  it('passes through valid values', () => {
    expect(clampThumbWidth(320)).toBe(320)
  })
})
