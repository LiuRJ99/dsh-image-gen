import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SubscriptionManager, SUBSCRIPTION_MAX_REFERENCE_IMAGES, type SubscriptionVendor } from '../src/subscription/manager.js'

/**
 * Wire-protocol tests for subscription image editing. These pin the contract
 * the vendor endpoints expect: endpoint selection by the presence of
 * reference images, reference-image encoding per channel, and the shared
 * 5-image guard. Network calls are stubbed; only the real request shape is
 * asserted.
 */

/** Valid non-expired OAuth blob the manager can use without refresh. */
function freshBlob(): { accessToken: string; refreshToken: string; expiresAt: number; accountId: string; email: string } {
  return {
    accessToken: 'access-token-value',
    refreshToken: 'refresh-token-value',
    expiresAt: Date.now() + 3_600_000,
    accountId: 'account-123',
    email: 'user@example.com',
  }
}

function harness() {
  const resolve = vi.fn(async () => ({ value: JSON.stringify(freshBlob()) }))
  const ctx = { credentials: { resolve } } as never
  const manager = new SubscriptionManager(ctx)
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({
    data: [{ b64_json: Buffer.from('stub').toString('base64') }],
  }), { status: 200, headers: { 'content-type': 'application/json' } }))
  vi.stubGlobal('fetch', fetchMock)
  return { manager, fetchMock }
}

describe('subscription manager edit wire protocol', () => {
  beforeEach(() => { vi.clearAllMocks() })
  afterEach(() => { vi.unstubAllGlobals() })

  it('targets the codex edits endpoint and encodes references as image_url data URLs', async () => {
    const { manager, fetchMock } = harness()
    const reference = { data: new Uint8Array([1, 2, 3, 4]), mediaType: 'image/png' }

    await manager.generate({ vendor: 'codex', prompt: 'make it blue', referenceImages: [reference] })

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://chatgpt.com/backend-api/codex/images/edits')
    const body = JSON.parse(String(init.body)) as { model: string; prompt: string; images: Array<{ image_url: string }> }
    expect(body.prompt).toBe('make it blue')
    expect(body.model).toBe('gpt-image-2.5-flare')
    expect(body.images).toHaveLength(1)
    expect(body.images[0]!.image_url).toBe(`data:image/png;base64,${Buffer.from(reference.data).toString('base64')}`)
    const headers = init.headers as Record<string, string>
    expect(headers.authorization).toBe('Bearer access-token-value')
    expect(headers['chatgpt-account-id']).toBe('account-123')
  })

  it('targets the grok edits endpoint and encodes references as typed image_url entries', async () => {
    const { manager, fetchMock } = harness()
    const reference = { data: new Uint8Array([9, 9]), mediaType: 'image/jpeg' }

    await manager.generate({ vendor: 'grok', prompt: 'make it blue', referenceImages: [reference] })

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.x.ai/v1/images/edits')
    const body = JSON.parse(String(init.body)) as { model: string; images: Array<{ type: string; image_url: string }> }
    expect(body.model).toBe('grok-imagine-image-2.0')
    expect(body.images).toHaveLength(1)
    expect(body.images[0]!.type).toBe('image_url')
    expect(body.images[0]!.image_url).toBe(`data:image/jpeg;base64,${Buffer.from(reference.data).toString('base64')}`)
  })

  it('keeps the generations endpoint when no reference images are supplied', async () => {
    const { manager, fetchMock } = harness()

    await manager.generate({ vendor: 'codex', prompt: 'a portrait' })

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://chatgpt.com/backend-api/codex/images/generations')
    await manager.generate({ vendor: 'grok', prompt: 'a portrait' })
    const [grokUrl] = fetchMock.mock.calls[1] as [string, RequestInit]
    expect(grokUrl).toBe('https://api.x.ai/v1/images/generations')
  })

  it('rejects more reference images than every channel accepts', async () => {
    const { manager, fetchMock } = harness()
    const references = Array.from({ length: SUBSCRIPTION_MAX_REFERENCE_IMAGES + 1 }, () => ({
      data: new Uint8Array([1]), mediaType: 'image/png',
    }))

    await expect(manager.generate({ vendor: 'codex', prompt: 'too many', referenceImages: references }))
      .rejects.toThrow('订阅生图最多支持')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('leaves no images field on the generation body when editing is absent', async () => {
    const { manager, fetchMock } = harness()

    await manager.generate({ vendor: 'grok', prompt: 'a portrait' })

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(String(init.body)) as Record<string, unknown>
    expect(body.images).toBeUndefined()
    expect(body.prompt).toBe('a portrait')
  })
})