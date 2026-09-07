import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { describe, expect, it } from 'vitest'
import {
  BUILTIN_INSPIRATION_CASES,
  INSPIRATION_SOURCE_URLS,
  InspirationDiskCache,
  builtinInspirationCatalog,
  isAllowedInspirationSourceUrl,
  parseHttpSourceUrl,
  parseInspirationCatalog,
  parseInspirationFilters,
  readResponseBytes,
} from '../src/inspiration.js'
import { serveInspirationRoute } from '../src/inspiration-route.js'
import { fetchInspirationCatalog } from '../src/client/inspiration-catalog-cache.js'

function request(method: string, url: string, body = ''): IncomingMessage {
  return {
    method,
    url,
    headers: {
      host: 'localhost:3080',
      origin: 'http://localhost:3080',
      'content-type': 'application/json',
    },
    [Symbol.asyncIterator]: async function* () {
      if (body !== '') yield body
    },
  } as unknown as IncomingMessage
}

function response() {
  const chunks: Buffer[] = []
  const result = {
    statusCode: 0,
    headers: {} as Record<string, string | number>,
    ended: false,
    body: () => Buffer.concat(chunks),
    writeHead(status: number, headers: Record<string, string | number>) {
      result.statusCode = status
      result.headers = headers
    },
    end(value?: unknown) {
      result.ended = true
      if (value !== undefined) chunks.push(Buffer.isBuffer(value) ? value : Buffer.from(String(value)))
    },
  }
  return result as unknown as ServerResponse & typeof result
}

describe('Inspiration schema and source security', () => {
  it('accepts only credential-free HTTP(S) URLs', () => {
    expect(parseHttpSourceUrl('https://example.test/a')).toBeInstanceOf(URL)
    expect(parseHttpSourceUrl('data:text/plain,hello')).toBeUndefined()
    expect(parseHttpSourceUrl('https://user:pass@example.test/a')).toBeUndefined()
    expect(parseHttpSourceUrl('https://example.test/a?redirect=https://evil.test')).toBeUndefined()
  })

  it('keeps remote URLs on the fixed repository path', () => {
    const allowed = `${INSPIRATION_SOURCE_URLS.jsdelivr}/catalog.json`
    expect(isAllowedInspirationSourceUrl(allowed)).toBe(true)
    expect(isAllowedInspirationSourceUrl(`${INSPIRATION_SOURCE_URLS.jsdelivr}/../../etc/passwd`)).toBe(false)
    expect(isAllowedInspirationSourceUrl('https://evil.test/inspiration/catalog.json')).toBe(false)
  })

  it('parses allowlisted filters and rejects unknown values', () => {
    expect(parseInspirationFilters('?category=portrait&style=editorial&scene=studio')).toEqual({
      category: 'portrait',
      style: 'editorial',
      scene: 'studio',
    })
    expect(parseInspirationFilters('?category=not-a-category')).toBeUndefined()
    expect(parseInspirationFilters('?unknown=value')).toBeUndefined()
  })

  it('keeps the built-in catalog compact and schema-valid', () => {
    const catalog = builtinInspirationCatalog(123)
    expect(catalog.cases).toHaveLength(8)
    expect(catalog.cases).toEqual(BUILTIN_INSPIRATION_CASES)
    expect(parseInspirationCatalog(catalog)?.cases).toHaveLength(8)
  })
})

describe('bounded response streams', () => {
  it('rejects an advertised response larger than the limit', async () => {
    const response = new Response('large', { headers: { 'content-length': '100' } })
    await expect(readResponseBytes(response, 4)).rejects.toMatchObject({ code: 'inspiration-payload-too-large' })
  })

  it('counts streamed chunks instead of trusting absent content-length', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('abc'))
        controller.enqueue(new TextEncoder().encode('def'))
        controller.close()
      },
    })
    await expect(readResponseBytes(new Response(stream), 5)).rejects.toMatchObject({ code: 'inspiration-payload-too-large' })
  })

  it('cancels an open stream after the byte limit is exceeded', async () => {
    let canceled = false
    const stream = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new TextEncoder().encode('too-large')) },
      cancel() { canceled = true },
    })
    await expect(readResponseBytes(new Response(stream), 2)).rejects.toMatchObject({ code: 'inspiration-payload-too-large' })
    expect(canceled).toBe(true)
  })
})

describe('browser Inspiration loaders', () => {
  it('uses the refresh route for forceRefresh instead of a stale catalog GET', async () => {
    let requestUrl = ''
    let requestMethod = ''
    const cached = {
      get: async () => undefined,
      put: async () => true,
      clear: async () => undefined,
    }
    const result = await fetchInspirationCatalog({
      forceRefresh: true,
      cache: cached as never,
      fetch: async (input, init) => {
        requestUrl = String(input)
        requestMethod = String(init?.method)
        return new Response(JSON.stringify(builtinInspirationCatalog(42)), { headers: { 'content-type': 'application/json' } })
      },
    })
    expect(requestUrl).toContain('/plugins/dsh-image-gen/inspiration/refresh')
    expect(requestMethod).toBe('POST')
    expect(result?.updatedAt).toBe(42)
  })
})

describe('same-origin Inspiration routes', () => {
  it('serves filtered catalog data and rejects cross-origin requests', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'dsh-inspiration-test-'))
    let cache: InspirationDiskCache | undefined
    try {
      cache = new InspirationDiskCache({ directory })
      const ok = response()
      await serveInspirationRoute(request('GET', '/plugins/dsh-image-gen/inspiration/catalog?category=portrait'), ok, { cache, now: () => 123 })
      expect(ok.statusCode).toBe(200)
      expect(JSON.parse(ok.body().toString()).cases.every((item: { category: string }) => item.category === 'portrait')).toBe(true)

      const denied = response()
      const crossOrigin = request('GET', '/plugins/dsh-image-gen/inspiration/catalog')
      crossOrigin.headers.origin = 'https://attacker.test'
      await serveInspirationRoute(crossOrigin, denied, { cache })
      expect(denied.statusCode).toBe(403)
    } finally {
      await cache?.clear()
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('uses fixed source fallback for images and never accepts a browser URL', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'dsh-inspiration-image-test-'))
    const seen: string[] = []
    let cache: InspirationDiskCache | undefined
    try {
      cache = new InspirationDiskCache({ directory })
      const fetch = async (input: string | URL): Promise<Response> => {
        seen.push(String(input))
        if (seen.length === 1) throw new Error('mirror unavailable')
        return new Response('<svg xmlns="http://www.w3.org/2000/svg"/>', { headers: { 'content-type': 'image/svg+xml' } })
      }
      const served = response()
      await serveInspirationRoute(request('GET', '/plugins/dsh-image-gen/inspiration/image/golden-hour-portrait'), served, { cache, fetch })
      expect(served.statusCode).toBe(200)
      expect(served.headers['content-type']).toBe('image/svg+xml')
      expect(seen[0]).toBe(`${INSPIRATION_SOURCE_URLS.mirror}/images/golden-hour-portrait.svg`)
      expect(seen[1]).toBe(`${INSPIRATION_SOURCE_URLS.jsdelivr}/images/golden-hour-portrait.svg`)

      const rejected = response()
      await serveInspirationRoute(request('GET', '/plugins/dsh-image-gen/inspiration/image?url=https://evil.test/image.png'), rejected, { cache, fetch })
      expect(rejected.statusCode).toBe(400)
    } finally {
      await cache?.clear()
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('refreshes through mirror → jsDelivr → GitHub and clears cache', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'dsh-inspiration-refresh-test-'))
    let calls = 0
    try {
      const cache = new InspirationDiskCache({ directory })
      const fetch = async (): Promise<Response> => {
        calls += 1
        if (calls < 3) return new Response('not-json', { status: 503 })
        return new Response(JSON.stringify(builtinInspirationCatalog(456)), {
          headers: { 'content-type': 'application/json' },
        })
      }
      const refreshed = response()
      await serveInspirationRoute(request('POST', '/plugins/dsh-image-gen/inspiration/refresh'), refreshed, { cache, fetch, now: () => 789 })
      expect(refreshed.statusCode).toBe(200)
      expect(calls).toBe(3)
      expect(JSON.parse(refreshed.body().toString()).updatedAt).toBe(456)

      const cleared = response()
      await serveInspirationRoute(request('POST', '/plugins/dsh-image-gen/inspiration/cache-clear'), cleared, { cache })
      expect(cleared.statusCode).toBe(200)
      expect(JSON.parse(cleared.body().toString())).toEqual({ ok: true })
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
