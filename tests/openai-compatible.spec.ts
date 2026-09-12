import { afterEach, describe, expect, it, vi } from 'vitest'
import { editOpenAICompatibleImage, generateOpenAICompatibleImage } from '../src/openai-compatible.js'

afterEach(() => { vi.unstubAllGlobals() })
const signal = new AbortController().signal

describe('OpenAI-compatible images', () => {
  it('posts a standard OpenAI image request and accepts base64 output', async () => {
    const image = Buffer.from('image bytes').toString('base64')
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: [{ b64_json: image }] }), { headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(generateOpenAICompatibleImage({ provider: 'openai', apiKey: 'key', baseURL: 'https://relay.example/v1', model: 'image-model', prompt: 'a cat', size: '1024x1024', maxBytes: 1024, signal })).resolves.toEqual({ data: new Uint8Array(Buffer.from('image bytes')), mediaType: 'image/png' })
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://relay.example/v1/images/generations')
  })

  it('uses multipart /images/edits with the source image', async () => {
    const image = Buffer.from('edited image').toString('base64')
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: [{ b64_json: image }] }), { headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(editOpenAICompatibleImage({
      apiKey: 'key', baseURL: 'https://api.openai.com/v1', model: 'gpt-image-2', prompt: 'add sunglasses',
      sourceImages: [
        { data: new Uint8Array(Buffer.from('source 1')), mediaType: 'image/png' },
        { data: new Uint8Array(Buffer.from('source 2')), mediaType: 'image/jpeg' },
      ],
      size: '1024x1024', maxBytes: 1024, signal,
    })).resolves.toEqual({ data: new Uint8Array(Buffer.from('edited image')), mediaType: 'image/png' })

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.openai.com/v1/images/edits')
    expect(init.headers).toMatchObject({ authorization: 'Bearer key' })
    expect((init.headers as Record<string, string>)['content-type']).toBeUndefined()
    const form = init.body as FormData
    expect(form.get('model')).toBe('gpt-image-2')
    expect(form.get('prompt')).toBe('add sunglasses')
    expect(form.get('size')).toBe('1024x1024')
    expect(form.getAll('image[]')).toHaveLength(2)
    expect(form.getAll('image[]')[0]).toBeInstanceOf(Blob)
  })

  it('keeps the singular multipart image field for one reference', async () => {
    const image = Buffer.from('edited image').toString('base64')
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: [{ b64_json: image }] }), { headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    await editOpenAICompatibleImage({
      apiKey: 'key', baseURL: 'https://relay.example/v1', model: 'image-model', prompt: 'edit',
      sourceImages: [{ data: new Uint8Array([1]), mediaType: 'image/png' }],
      maxBytes: 1024, signal,
    })

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    const form = init.body as FormData
    expect(form.get('image')).toBeInstanceOf(Blob)
    expect(form.getAll('image[]')).toHaveLength(0)
  })

  it('downloads Ark URL output with its declared media type', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ url: 'https://image.example/result' }] }), { headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(new Uint8Array([1, 2]), { headers: { 'content-type': 'image/jpeg' } }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(generateOpenAICompatibleImage({ provider: 'seedream', apiKey: 'key', baseURL: 'https://ark.example/api/v3', model: 'seedream', prompt: 'a cat', size: '2K', maxBytes: 1024, signal })).resolves.toEqual({ data: new Uint8Array([1, 2]), mediaType: 'image/jpeg' })
  })

  // Relay CDNs that reject Authorization headers on public image URLs (#37):
  // the authenticated download gets a 401/403, the retry without the header succeeds.
  it('retries image download without the auth header after 401', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ url: 'https://cdn.example/result' }] }), { headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response(new Uint8Array([3, 4]), { headers: { 'content-type': 'image/png' } }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(generateOpenAICompatibleImage({ provider: 'openai-compat', apiKey: 'key', baseURL: 'https://relay.example/v1', model: 'agnes-image', prompt: 'a cat', size: '1024x1024', maxBytes: 1024, signal })).resolves.toEqual({ data: new Uint8Array([3, 4]), mediaType: 'image/png' })
    const downloadCall = fetchMock.mock.calls[1] as unknown as [string, RequestInit]
    expect(downloadCall[1]?.headers).toEqual({ authorization: 'Bearer key' })
    const retryCall = fetchMock.mock.calls[2] as unknown as [string, RequestInit]
    expect(retryCall[1]?.headers).toBeUndefined()
  })

  it('retries image download without the auth header after 403', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ url: 'https://cdn.example/result' }] }), { headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(null, { status: 403 }))
      .mockResolvedValueOnce(new Response(new Uint8Array([5]), { headers: { 'content-type': 'image/png' } }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(generateOpenAICompatibleImage({ provider: 'openai-compat', apiKey: 'key', baseURL: 'https://relay.example/v1', model: 'agnes-image', prompt: 'a cat', size: '1024x1024', maxBytes: 1024, signal })).resolves.toEqual({ data: new Uint8Array([5]), mediaType: 'image/png' })
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('does not retry download failures other than 401/403', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ url: 'https://cdn.example/result' }] }), { headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(null, { status: 500 }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(generateOpenAICompatibleImage({ provider: 'openai-compat', apiKey: 'key', baseURL: 'https://relay.example/v1', model: 'agnes-image', prompt: 'a cat', size: '1024x1024', maxBytes: 1024, signal })).rejects.toThrow('image download failed (500)')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('gives up when the unauthenticated retry also fails', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ url: 'https://cdn.example/result' }] }), { headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(generateOpenAICompatibleImage({ provider: 'openai-compat', apiKey: 'key', baseURL: 'https://relay.example/v1', model: 'agnes-image', prompt: 'a cat', size: '1024x1024', maxBytes: 1024, signal })).rejects.toThrow('image download failed (401)')
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })
})
