import { afterEach, describe, expect, it, vi } from 'vitest'
import { generateOpenAICompatibleImage } from '../src/openai-compatible.js'

afterEach(() => { vi.unstubAllGlobals() })
const signal = new AbortController().signal

describe('generateOpenAICompatibleImage', () => {
  it('posts a standard OpenAI image request and accepts base64 output', async () => {
    const image = Buffer.from('image bytes').toString('base64')
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: [{ b64_json: image }] }), { headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(generateOpenAICompatibleImage({ provider: 'openai', apiKey: 'key', baseURL: 'https://relay.example/v1', model: 'image-model', prompt: 'a cat', size: '1024x1024', maxBytes: 1024, signal })).resolves.toEqual({ data: new Uint8Array(Buffer.from('image bytes')), mediaType: 'image/png' })
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://relay.example/v1/images/generations')
    expect(init.headers).toMatchObject({ authorization: 'Bearer key', 'content-type': 'application/json' })
  })

  it('downloads Ark URL output with its declared media type', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ url: 'https://image.example/result' }] }), { headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(new Uint8Array([1, 2]), { headers: { 'content-type': 'image/jpeg' } }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(generateOpenAICompatibleImage({ provider: 'seedream', apiKey: 'key', baseURL: 'https://ark.example/api/v3', model: 'seedream', prompt: 'a cat', size: '2K', maxBytes: 1024, signal })).resolves.toEqual({ data: new Uint8Array([1, 2]), mediaType: 'image/jpeg' })
    expect(JSON.parse((fetchMock.mock.calls[0]?.[1] as RequestInit).body as string)).toMatchObject({ response_format: 'url' })
  })
})
