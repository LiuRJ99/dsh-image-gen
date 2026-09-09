import type { IncomingMessage, ServerResponse } from 'node:http'
import { describe, expect, it, vi } from 'vitest'
import type { CpaImageGenerationService } from '../src/cpa-contract.js'
import { serveImageModels } from '../src/image-model-route.js'

function request(origin = 'http://localhost:3080'): IncomingMessage {
  return {
    method: 'GET',
    url: '/plugins/dsh-image-gen/models',
    headers: { host: 'localhost:3080', origin },
  } as unknown as IncomingMessage
}

function response() {
  const chunks: Buffer[] = []
  const result = {
    statusCode: 0,
    headers: {} as Record<string, string | number>,
    body: () => Buffer.concat(chunks).toString('utf8'),
    setHeader(name: string, value: string | number) { result.headers[name] = value },
    end(value?: unknown) {
      if (value !== undefined) chunks.push(Buffer.isBuffer(value) ? value : Buffer.from(String(value)))
    },
  }
  return result as unknown as ServerResponse & typeof result
}

describe('Image model catalog route', () => {
  it('returns the CPA-owned sanitized image model catalog', async () => {
    const listModels = vi.fn<CpaImageGenerationService['listModels']>().mockResolvedValue([{
      id: 'gpt-image-2.5',
      name: 'GPT Image 2.5',
      engine: 'gpt',
      supportsGenerate: true,
      supportsEdit: true,
    }])
    const res = response()
    await serveImageModels(request(), res, { getService: () => ({ listModels }) })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body())).toEqual({ models: [{
      id: 'gpt-image-2.5',
      name: 'GPT Image 2.5',
      engine: 'gpt',
      supportsGenerate: true,
      supportsEdit: true,
    }] })
    expect(listModels).toHaveBeenCalledTimes(1)
  })

  it('returns a stable 503 when the CPA catalog capability is missing', async () => {
    const res = response()
    await serveImageModels(request(), res, { getService: () => ({ generate: vi.fn() }) })
    expect(res.statusCode).toBe(503)
    expect(JSON.parse(res.body())).toEqual({ error: 'image-model-catalog-unavailable' })
  })

  it('rejects cross-origin requests before invoking the service', async () => {
    const listModels = vi.fn<CpaImageGenerationService['listModels']>()
    const res = response()
    await serveImageModels(request('https://attacker.test'), res, { getService: () => ({ listModels }) })
    expect(res.statusCode).toBe(403)
    expect(listModels).not.toHaveBeenCalled()
  })
})
