import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SubscriptionBlob } from '../src/subscription/blob.js'
import { SubscriptionManager } from '../src/subscription/manager.js'
import { antigravityResolveProject, setAntigravityVersionForTest } from '../src/subscription/vendors/antigravity.js'

const blob: SubscriptionBlob = {
  accessToken: 'google-access-secret', refreshToken: 'google-refresh-secret',
  expiresAt: Date.now() + 3_600_000, accountId: 'private-account-id',
  email: 'private@example.com', label: 'Google',
}
const daily = 'https://daily-cloudcode-pa.googleapis.com'
const prod = 'https://cloudcode-pa.googleapis.com'
const unsupported = {
  allowedTiers: [{ id: 'standard-tier', isDefault: true }],
  ineligibleTiers: [{ tierId: 'free-tier', reasonCode: 'UNSUPPORTED_CLIENT', reasonMessage: 'Client migration required' }],
}
const json = (payload: unknown, status = 200) => new Response(JSON.stringify(payload), {
  status, headers: { 'content-type': 'application/json' },
})
const image = () => new Response('data: ' + JSON.stringify({
  response: { candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: 'c3R1Yg==' } }] } }] },
}) + '\n', { headers: { 'content-type': 'text/event-stream' } })
const manager = () => new SubscriptionManager({
  credentials: { resolve: async () => ({ value: JSON.stringify(blob) }) },
} as never)

describe('Antigravity discovery and failure diagnostics', () => {
  beforeEach(() => { setAntigravityVersionForTest('2.0.6') })
  afterEach(() => { vi.unstubAllGlobals(); setAntigravityVersionForTest(undefined) })

  it.each([
    ['win32', 'x64', 'WINDOWS_AMD64'],
    ['darwin', 'x64', 'DARWIN_AMD64'],
    ['darwin', 'arm64', 'DARWIN_ARM64'],
    ['linux', 'x64', 'LINUX_AMD64'],
    ['linux', 'arm64', 'LINUX_ARM64'],
    ['win32', 'arm64', 'PLATFORM_UNSPECIFIED'],
  ])('sends the Google platform enum for %s/%s in both metadata locations', async (platform, arch, expected) => {
    const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')!
    const originalArch = Object.getOwnPropertyDescriptor(process, 'arch')!
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body))
      const metadata = JSON.parse(new Headers(init.headers).get('Client-Metadata')!)
      expect(body.metadata).toEqual(metadata)
      expect(body.metadata.platform).toBe(expected)
      return json({ cloudaicompanionProject: 'actual-project' })
    })
    vi.stubGlobal('fetch', fetchMock)
    try {
      Object.defineProperty(process, 'platform', { value: platform })
      Object.defineProperty(process, 'arch', { value: arch })
      expect(await antigravityResolveProject(blob)).toBe('actual-project')
      expect(fetchMock).toHaveBeenCalledTimes(1)
    } finally {
      Object.defineProperty(process, 'platform', originalPlatform)
      Object.defineProperty(process, 'arch', originalArch)
    }
  })

  it('re-discovers a missing project on the next generation instead of caching the fallback as an account project', async () => {
    let hasProject = false
    const fetchMock = vi.fn(async (url: string) => url.includes(':loadCodeAssist')
      ? json(hasProject ? { cloudaicompanionProject: { id: 'actual-project' } } : unsupported)
      : image())
    vi.stubGlobal('fetch', fetchMock)
    const subject = manager()
    await subject.generate({ vendor: 'antigravity', prompt: 'a blue cup' })
    const firstLoads = fetchMock.mock.calls.filter(([url]) => url.includes(':loadCodeAssist')).length
    hasProject = true
    await subject.generate({ vendor: 'antigravity', prompt: 'a red cup' })
    expect(fetchMock.mock.calls.filter(([url]) => url.includes(':loadCodeAssist')).length).toBeGreaterThan(firstLoads)
    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>
    expect(JSON.parse(String(calls.filter(([url]) => url.includes(':streamGenerateContent')).at(-1)![1].body)).project).toBe('actual-project')
  })

  it('keeps caching a real account project and uses valid platform metadata on generation', async () => {
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      if (url.includes(':loadCodeAssist')) return json({ cloudaicompanionProject: 'actual-project' })
      const platform = JSON.parse(new Headers(init.headers).get('Client-Metadata')!).platform
      expect(['WINDOWS_AMD64', 'DARWIN_AMD64', 'DARWIN_ARM64', 'LINUX_AMD64', 'LINUX_ARM64', 'PLATFORM_UNSPECIFIED']).toContain(platform)
      return image()
    })
    vi.stubGlobal('fetch', fetchMock)
    const subject = manager()
    await subject.generate({ vendor: 'antigravity', prompt: 'a blue cup' })
    await subject.generate({ vendor: 'antigravity', prompt: 'a red cup' })
    expect(fetchMock.mock.calls.filter(([url]) => url.includes(':loadCodeAssist'))).toHaveLength(1)
  })

  it('tries the ordinary daily generation endpoint before the production fallback', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes(':loadCodeAssist')) return json({ cloudaicompanionProject: 'actual-project' })
      return url.startsWith(daily + '/') ? image() : json({ error: { message: 'upstream unavailable' } }, 500)
    })
    vi.stubGlobal('fetch', fetchMock)
    await expect(manager().generate({ vendor: 'antigravity', prompt: 'a blue cup' })).resolves.toEqual([{ b64_json: 'c3R1Yg==' }])
    expect(fetchMock.mock.calls.some(([url]) => url.startsWith(prod + '/') && url.includes(':streamGenerateContent'))).toBe(false)
  })

  it('uses ordinary daily discovery when the existing discovery endpoints fail', async () => {
    const fetchMock = vi.fn(async (url: string) => url.startsWith(daily + '/')
      ? json({ cloudaicompanionProject: 'daily-account-project' })
      : json({ error: { message: 'discovery unavailable' } }, 500))
    vi.stubGlobal('fetch', fetchMock)
    expect(await antigravityResolveProject(blob)).toBe('daily-account-project')
  })

  it('preserves discovery eligibility and all failed endpoints instead of exposing only the final 429', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes(':loadCodeAssist')) return json(unsupported)
      const status = url.startsWith(prod + '/') ? 429 : 500
      return json({ error: { status: status === 429 ? 'RESOURCE_EXHAUSTED' : 'INTERNAL', message: 'upstream rejected request' } }, status)
    })
    vi.stubGlobal('fetch', fetchMock)
    const error = await manager().generate({ vendor: 'antigravity', prompt: 'a blue cup' }).catch(value => value as Error)
    expect(error).toBeInstanceOf(Error)
    expect(error.message).toContain('UNSUPPORTED_CLIENT')
    expect(error.message).toContain('兼容项目')
    expect(error.message).toContain('HTTP 500')
    expect(error.message).toContain('HTTP 429')
    expect(error.message).toContain('daily-cloudcode-pa.googleapis.com')
    expect(error.message).toContain('cloudcode-pa.googleapis.com')
  })

  it('redacts credentials and account identity from propagated upstream diagnostics', async () => {
    const privateDetail = [blob.accessToken, blob.refreshToken, blob.accountId, blob.email].join(' ')
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: { message: privateDetail } }, 400)))
    const error = await manager().generate({ vendor: 'antigravity', prompt: 'a blue cup' }).catch(value => value as Error)
    for (const secret of [blob.accessToken, blob.refreshToken, blob.accountId, blob.email]) expect(error.message).not.toContain(secret)
    expect(error.message).toContain('[redacted]')
    expect(error.message).toContain('loadCodeAssist')
  })

  it('does not turn an unsupported Code Assist tier into a blanket image-generation ban or invoke onboarding', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes(':loadCodeAssist')) return json(unsupported)
      expect(url).toContain(':streamGenerateContent')
      return image()
    })
    vi.stubGlobal('fetch', fetchMock)
    await expect(manager().generate({ vendor: 'antigravity', prompt: 'a blue cup' })).resolves.toEqual([{ b64_json: 'c3R1Yg==' }])
    expect(fetchMock.mock.calls.some(([url]) => url.includes(':onboardUser'))).toBe(false)
  })

  it('propagates cancellation during discovery without continuing through the fallback endpoints', async () => {
    const controller = new AbortController()
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      controller.abort(new Error('cancelled by caller'))
      init.signal!.throwIfAborted()
      return json({ cloudaicompanionProject: 'actual-project' })
    })
    vi.stubGlobal('fetch', fetchMock)
    await expect(manager().generate({ vendor: 'antigravity', prompt: 'a blue cup', signal: controller.signal })).rejects.toThrow('cancelled by caller')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
