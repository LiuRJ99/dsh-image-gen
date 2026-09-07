import type { ImageAttachmentRef, StoredImageAttachment } from '@deepseek-ai/dsh-attachment'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { describe, expect, it, vi } from 'vitest'
import { clampThumbWidth, renderThumbnail, serveDelete, serveImage } from '../src/image-route.js'

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

  it('rejects unknown image request kinds instead of silently serving full data', async () => {
    const deps = { readImage: async () => stored }
    const res = makeResponse()
    await serveImage(makeRequest(JSON.stringify({ attachment: stored.ref, kind: 'raw' })), res as never, deps)
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

describe('serveDelete', () => {
  it('deletes only paths accepted by the injected safe helper', async () => {
    const deleted: string[] = []
    const res = makeResponse()
    const path = `/workspace/dsh-image-gen/image-${'0123456789abcdef'.repeat(4)}.png`
    await serveDelete(makeRequest(JSON.stringify({ paths: [path] })), res as never, {
      deleteWorkspaceImage: async (value) => { deleted.push(value); return true },
    })
    expect(res.statusCode).toBe(200)
    expect(deleted).toEqual([path])
    expect(JSON.parse(res.body())).toMatchObject({ ok: true, deletedCount: 1 })
  })

  it('rejects legacy and non-canonical file names before calling the deleter', async () => {
    const deleted = vi.fn(async () => true)
    const res = makeResponse()
    await serveDelete(makeRequest(JSON.stringify({ paths: ['/workspace/image-01234567.png', `/workspace/image-${'a'.repeat(63)}.png`] })), res as never, { deleteWorkspaceImage: deleted })
    expect(deleted).not.toHaveBeenCalled()
    expect(JSON.parse(res.body())).toMatchObject({ ok: false, failedFiles: [{ error: 'invalid-path' }, { error: 'invalid-path' }] })
  })

  it('keeps a failed path in the response and uses stable error codes', async () => {
    const res = makeResponse()
    const path = `/workspace/image-${'fedcba9876543210'.repeat(4)}.png`
    await serveDelete(makeRequest(JSON.stringify({ paths: [path] })), res as never, {
      deleteWorkspaceImage: async () => { throw new Error('/secret/path') },
    })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body())).toMatchObject({ ok: false, failedFiles: [{ error: 'delete-failed' }] })
    expect(res.body()).not.toContain('/secret/path')
  })

  it('rejects an origin when the Host header is missing', async () => {
    const req = makeRequest(JSON.stringify({ paths: [] }))
    req.headers.host = undefined
    const res = makeResponse()
    await serveDelete(req, res as never, { deleteWorkspaceImage: async () => true })
    expect(res.statusCode).toBe(403)
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
