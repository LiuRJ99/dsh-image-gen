// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { ImageGenerationSettingsCard } from '../src/client/index.js'

it('reads the first Host update even when it arrives before subscription', async () => {
  const initial = { value: undefined, writable: false }
  const ready = { value: { engine: 'gemini', saveToWorkspace: true, workspaceFolder: 'host-first-update' }, writable: true }
  let snapshot: unknown = initial
  const unsubscribe = vi.fn()
  const scope = {
    getSnapshot: () => snapshot,
    subscribe: () => { snapshot = ready; return unsubscribe },
    set: async () => true,
  }
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ models: [] })))
  const element = document.createElement('div')
  document.body.append(element)
  const root = createRoot(element)
  try {
    await act(async () => {
      root.render(createElement(ImageGenerationSettingsCard, { scope } as never))
    })
    expect(element.querySelector<HTMLInputElement>('input[placeholder="dsh-image-gen"]')?.value).toBe('host-first-update')
    expect(element.querySelector<HTMLInputElement>('input[placeholder="dsh-image-gen"]')?.disabled).toBe(false)
  } finally {
    await act(async () => { root.unmount() })
    element.remove()
    vi.unstubAllGlobals()
  }
  expect(unsubscribe).toHaveBeenCalledOnce()
})
