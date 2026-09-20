import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactElement, ReactNode } from 'react'
import { ImageGenerationSettingsCard } from '../src/client/index.js'

// Exercise the actual rendered form handlers without a DOM dependency. Effects
// (host subscriptions and status polling) are outside this form-action harness.
const hooks = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0 }))
vi.mock('react', async importOriginal => {
  const react = await importOriginal<typeof import('react')>()
  return {
    ...react,
    useEffect: () => {},
    useState(initial: unknown) {
      const index = hooks.cursor++
      if (!(index in hooks.values)) hooks.values[index] = typeof initial === 'function' ? initial() : initial
      return [hooks.values[index], (next: unknown) => {
        hooks.values[index] = typeof next === 'function' ? next(hooks.values[index]) : next
      }]
    },
  }
})

type Element = ReactElement<Record<string, any>>
function elements(node: ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements)
  if (node === null || typeof node !== 'object' || !('props' in node)) return []
  const element = node as Element
  return [element, ...elements(element.props.children)]
}
function text(node: ReactNode): string {
  if (Array.isArray(node)) return node.map(text).join('')
  if (node === null || typeof node === 'boolean' || node === undefined) return ''
  if (typeof node !== 'object') return String(node)
  return 'props' in node ? text((node as Element).props.children) : ''
}

function formHarness(lang = 'zh') {
  const setKey = vi.fn(async () => ({ ok: true }))
  const setSetting = vi.fn(async () => {})
  const props = {
    scope: {
      getSnapshot: () => ({ writable: true, value: { openaiCompatBaseURL: 'https://relay.example/v1' } }),
      subscribe: vi.fn(), set: setSetting,
    },
    credentials: { describe: vi.fn(), set: setKey },
    credentialsAvailable: () => true,
    locale: { getSnapshot: () => ({ active: lang }) },
  } as unknown as Parameters<typeof ImageGenerationSettingsCard>[0]
  const render = () => {
    hooks.cursor = 0
    return ImageGenerationSettingsCard(props)
  }
  const row = () => elements(render()).find(element => element.key === 'openai-compat'
    && element.props.className?.startsWith('dsh-ig-provider-row '))!
  const find = (predicate: (element: Element) => boolean) => elements(row()).find(predicate)!
  elements(render()).find(element => element.props.className === 'dsh-ig-head')!.props.onClick()
  find(element => element.props.className === 'dsh-ig-provider-head').props.onClick()
  return {
    setKey, setSetting,
    rowText: () => text(row()),
    typeKey: (value: string) => find(element => element.props.type === 'password').props.onChange({ target: { value } }),
    keyValue: () => find(element => element.props.type === 'password').props.value,
    disabled: (label: string) => find(element => element.type === 'button' && text(element) === label).props.disabled,
    click: (label: string) => find(element => element.type === 'button' && text(element) === label).props.onClick(),
    save: () => find(element => element.type === 'form').props.onSubmit({ preventDefault() {} }),
  }
}

beforeEach(() => { hooks.values = []; hooks.cursor = 0 })
afterEach(() => { vi.unstubAllGlobals() })

describe('settings card credential actions', () => {
  it.each(['拉取模型', '测试连接'])('asks to save before %s without sending a request or storing the draft', async action => {
    const fetch = vi.fn(async (_url: string, _init: RequestInit) => ({ ok: true, json: async (): Promise<Record<string, unknown>> => ({ ok: false, reason: 'missing-key' }) }))
    vi.stubGlobal('fetch', fetch)
    const form = formHarness()
    form.typeKey('  sk-draft  ')
    form.click(action)
    await vi.waitFor(() => expect(form.rowText()).toContain('请先保存 API Key'))
    expect(fetch).not.toHaveBeenCalled()
    expect(form.setKey).not.toHaveBeenCalled()
    expect(form.keyValue()).toBe('  sk-draft  ')
  })

  it('also blocks probing a replacement key when a previous key was saved', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const form = formHarness('en')
    form.typeKey('sk-old')
    form.save()
    await vi.waitFor(() => expect(form.keyValue()).toBe(''))
    form.typeKey('sk-replacement')
    form.click('Test connection')
    expect(form.rowText()).toContain('Save the API key first')
    expect(fetch).not.toHaveBeenCalled()
    expect(form.setKey).toHaveBeenCalledTimes(1)
  })

  it('clears old model and connection errors after saving, then allows model fetching', async () => {
    const fetch = vi.fn(async (_url: string, _init: RequestInit) => ({ ok: true, json: async (): Promise<Record<string, unknown>> => ({ ok: false, reason: 'missing-key' }) }))
    vi.stubGlobal('fetch', fetch)
    const form = formHarness()
    form.click('拉取模型')
    await vi.waitFor(() => expect(form.rowText()).toContain('Key 未配置'))
    form.click('测试连接')
    await vi.waitFor(() => expect(form.rowText().match(/Key 未配置/g)).toHaveLength(2))
    form.typeKey('  sk-saved  ')
    form.save()
    await vi.waitFor(() => expect(form.rowText()).toContain('已保存'))
    expect(form.setKey).toHaveBeenCalledWith('DSH_IMAGE_GEN_OPENAI_COMPAT_KEY', 'sk-saved')
    expect(form.keyValue()).toBe('')
    expect(form.rowText()).not.toContain('Key 未配置')
    fetch.mockResolvedValue({ ok: true, json: async () => ({ ok: true, models: ['gpt-image-1'] }) })
    form.click('拉取模型')
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(3))
    expect(JSON.parse(fetch.mock.calls[2]![1].body as string)).toEqual({ provider: 'openai-compat', action: 'models' })
  })

  it.each(['拉取模型', '测试连接'])('disables saving until the outstanding %s request finishes', async action => {
    let finish!: (response: Response) => void
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => { finish = resolve })))
    const form = formHarness()
    form.click(action)
    expect(form.disabled('保存')).toBe(true)
    finish(new Response(JSON.stringify({ ok: false, reason: 'missing-key' })))
    await vi.waitFor(() => expect(form.disabled('保存')).toBe(false))
  })

  it('disables model fetching and probing while the key is being saved', async () => {
    const form = formHarness()
    let finish!: () => void
    form.setSetting.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve }))
    form.typeKey('sk-draft')
    form.save()
    expect(form.disabled('拉取模型')).toBe(true)
    expect(form.disabled('测试连接')).toBe(true)
    finish()
    await vi.waitFor(() => expect(form.disabled('测试连接')).toBe(false))
    expect(form.disabled('拉取模型')).toBe(false)
  })

  it('preserves the draft and earlier model error when saving fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ ok: false, reason: 'missing-key' }) })))
    const form = formHarness()
    form.click('拉取模型')
    await vi.waitFor(() => expect(form.rowText()).toContain('Key 未配置'))
    form.typeKey('sk-draft')
    form.setSetting.mockRejectedValueOnce(new Error('Settings unavailable'))
    form.save()
    await vi.waitFor(() => expect(form.rowText()).toContain('Settings unavailable'))
    expect(form.rowText()).toContain('Key 未配置')
    expect(form.keyValue()).toBe('sk-draft')
    expect(form.setKey).not.toHaveBeenCalled()
  })
})
