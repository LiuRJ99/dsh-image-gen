import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { describe, expect, it, vi } from 'vitest'
import type { CpaImageGenerationService } from '../src/cpa-contract.js'
import { serveCpaGenerate } from '../src/cpa-generate-route.js'

const attachment = {
  attachmentId: 'sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  mediaType: 'image/png' as const,
  bytes: 3,
  width: 1,
  height: 1,
}

function request(body: unknown, origin = 'http://localhost:3080'): IncomingMessage {
  const encoded = JSON.stringify(body)
  return {
    method: 'POST',
    url: '/plugins/dsh-image-gen/generate',
    headers: { host: 'localhost:3080', origin, 'content-type': 'application/json' },
    [Symbol.asyncIterator]: async function* () { yield encoded },
  } as unknown as IncomingMessage
}

function response() {
  const chunks: Buffer[] = []
  const result = {
    statusCode: 0,
    headers: {} as Record<string, string | number>,
    body: () => Buffer.concat(chunks).toString('utf8'),
    writeHead(status: number, headers: Record<string, string | number>) {
      result.statusCode = status
      result.headers = headers
    },
    end(value?: unknown) {
      if (value !== undefined) chunks.push(Buffer.isBuffer(value) ? value : Buffer.from(String(value)))
    },
  }
  return result as unknown as ServerResponse & typeof result
}

function deps(
  generate: CpaImageGenerationService['generate'],
  getDefaultModel?: string,
): Parameters<typeof serveCpaGenerate>[2] {
  return {
    getService: () => ({
      generate,
      listModels: async () => [{
        id: getDefaultModel ?? 'gpt-image-2.5',
        name: getDefaultModel ?? 'gpt-image-2.5',
        engine: getDefaultModel?.startsWith('gemini-') ? 'gemini' as const : 'gpt' as const,
        supportsGenerate: true,
      }],
    }),
    ...(getDefaultModel === undefined ? {} : { getDefaultModel: () => getDefaultModel }),
    saveImage: vi.fn(async () => attachment),
    maxImageBytes: 1024,
    mediaTypes: ['image/png'],
  }
}

describe('CPA generation route', () => {
  it('maps GPT aspect-ratio compatibility input to size and strips Gemini-only fields', async () => {
    const generate = vi.fn<CpaImageGenerationService['generate']>().mockResolvedValue({ data: new Uint8Array([1, 2, 3]), mediaType: 'image/png' })
    const res = response()
    await serveCpaGenerate(request({ engine: 'gpt', prompt: 'vertical poster', aspect_ratio: '9:16', image_size: '4K' }), res, deps(generate))

    expect(res.statusCode).toBe(200)
    expect(generate).toHaveBeenCalledWith(expect.objectContaining({ engine: 'gpt', prompt: 'vertical poster', size: '1024x1792' }))
    expect(generate.mock.calls[0]?.[0]).not.toHaveProperty('aspectRatio')
    expect(generate.mock.calls[0]?.[0]).not.toHaveProperty('imageSize')
  })

  it('keeps Gemini controls and ignores a generic OpenAI size', async () => {
    const generate = vi.fn<CpaImageGenerationService['generate']>().mockResolvedValue({ data: new Uint8Array([1]), mediaType: 'image/png' })
    const res = response()
    await serveCpaGenerate(request({ engine: 'gemini', prompt: 'landscape', aspect_ratio: '16:9', image_size: '2K', size: '1792x1024' }), res, deps(generate))

    expect(res.statusCode).toBe(200)
    expect(generate).toHaveBeenCalledWith(expect.objectContaining({ engine: 'gemini', prompt: 'landscape', aspectRatio: '16:9', imageSize: '2K' }))
    expect(generate.mock.calls[0]?.[0]).not.toHaveProperty('size')
  })

  it('accepts a CPA model id and forwards it to the Host image service', async () => {
    const generate = vi.fn<CpaImageGenerationService['generate']>().mockResolvedValue({
      data: new Uint8Array([1, 2, 3]),
      mediaType: 'image/png',
      model: 'gpt-image-2.5',
    })
    const res = response()
    await serveCpaGenerate(request({ engine: 'gpt', prompt: 'selected', model: 'gpt-image-2.5' }), res, deps(generate))
    expect(res.statusCode).toBe(200)
    expect(generate).toHaveBeenCalledWith(expect.objectContaining({ engine: 'gpt', model: 'gpt-image-2.5', prompt: 'selected' }))
    expect(JSON.parse(res.body())).toMatchObject({ engine: 'gpt', model: 'gpt-image-2.5' })
  })

  it('does not claim a model when an older CPA service has no model catalog', async () => {
    const generate = vi.fn<CpaImageGenerationService['generate']>().mockResolvedValue({ data: new Uint8Array([1]), mediaType: 'image/png' })
    const res = response()
    await serveCpaGenerate(request({ engine: 'gpt', prompt: 'legacy', model: 'gpt-image-2.5' }), res, {
      ...deps(generate),
      getService: () => ({ generate }),
    })
    expect(res.statusCode).toBe(200)
    expect(generate).toHaveBeenCalledWith(expect.objectContaining({ engine: 'gpt' }))
    expect(generate.mock.calls[0]?.[0]).not.toHaveProperty('model')
    expect(JSON.parse(res.body())).not.toHaveProperty('model')
  })

  it('uses the configured model for browser regeneration when the body only names an engine', async () => {
    const generate = vi.fn<CpaImageGenerationService['generate']>().mockResolvedValue({ data: new Uint8Array([1]), mediaType: 'image/png', model: 'gemini-future-image' })
    const res = response()
    await serveCpaGenerate(request({ engine: 'gemini', prompt: 'configured model' }), res, deps(generate, 'gemini-future-image'))
    expect(res.statusCode).toBe(200)
    expect(generate).toHaveBeenCalledWith(expect.objectContaining({ engine: 'gemini', model: 'gemini-future-image' }))
    expect(JSON.parse(res.body())).toMatchObject({ model: 'gemini-future-image' })
  })

  it('returns a stable timeout when the CPA service remains pending', async () => {
    vi.useFakeTimers()
    try {
      const generate = vi.fn<CpaImageGenerationService['generate']>(({ signal }) => new Promise((_, reject) => {
        signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { code: 'ABORTED' })), { once: true })
      }))
      const res = response()
      const pending = serveCpaGenerate(request({ engine: 'gpt', prompt: 'pending' }), res, deps(generate))
      await Promise.resolve()
      await Promise.resolve()
      await vi.advanceTimersByTimeAsync(120_000)
      await pending
      expect(res.statusCode).toBe(504)
      expect(JSON.parse(res.body())).toEqual({ error: 'generation-timeout' })
    } finally {
      vi.useRealTimers()
    }
  })

  it('returns a stable unavailable response when CPA service is missing', async () => {
    const res = response()
    await serveCpaGenerate(request({ engine: 'gpt', prompt: 'square' }), res, { ...deps(vi.fn()), getService: () => undefined })
    expect(res.statusCode).toBe(503)
    expect(JSON.parse(res.body())).toEqual({ error: 'image-service-unavailable' })
  })

  it('preserves a successful attachment when optional workspace saving fails', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-cpa-route-'))
    try {
      const generate = vi.fn<CpaImageGenerationService['generate']>().mockResolvedValue({ data: new Uint8Array([1]), mediaType: 'image/png' })
      const base = deps(generate)
      const res = response()
      await serveCpaGenerate(request({ engine: 'gpt', prompt: 'safe save' }), res, {
        ...base,
        getWorkspaceOptions: () => ({ enabled: true, folder: 'dsh-image-gen', activeRoot: root }),
        getAllowedWorkspaceRoots: () => [root],
        readImage: async () => ({ ref: attachment, data: new Uint8Array([9, 8, 7]) }),
        saveToWorkspace: async () => { throw new Error('disk unavailable') },
      })
      expect(res.statusCode).toBe(200)
      expect(JSON.parse(res.body())).toMatchObject({ attachment, engine: 'gpt', saveError: 'workspace-save-failed' })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('rejects cross-origin requests before invoking CPA', async () => {
    const generate = vi.fn<CpaImageGenerationService['generate']>()
    const res = response()
    await serveCpaGenerate(request({ engine: 'gpt', prompt: 'blocked' }, 'https://attacker.test'), res, deps(generate))
    expect(res.statusCode).toBe(403)
    expect(generate).not.toHaveBeenCalled()
  })
})
