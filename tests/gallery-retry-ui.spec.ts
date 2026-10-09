// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GalleryViewTab } from '../src/client/gallery-view.js'
import { CPA_GENERATE_ROUTE, WORKSPACES_ROUTE } from '../src/shared.js'
import { SingleGeneratedImageView } from '../src/client/turn-tail.js'

const save = vi.hoisted(() => vi.fn())
const gallery = vi.hoisted(() => ({ get: vi.fn(), notify: undefined as (() => void) | undefined }))
vi.mock('../src/client/gallery-store.js', async importOriginal => ({ ...await importOriginal<object>(), saveGalleryItem: save, getGalleryItems: gallery.get, subscribeGallery: (listener: () => void) => { gallery.notify = listener; return () => { gallery.notify = undefined } } }))
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); document.body.innerHTML = '' })

describe('recoverable gallery save failure', () => {
  it('shows the failure, retains the image, and retries persistence without regenerating or fetching it again', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    save.mockReset().mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    const fetchImage = vi.fn(async () => ({ ok: true, blob: async () => new Blob(['image']) }))
    vi.stubGlobal('fetch', fetchImage)
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:test-image'), revokeObjectURL: vi.fn() }))
    const element = document.createElement('div'); document.body.appendChild(element)
    const root = createRoot(element)
    const attachment = { attachmentId: 'sha256:retry-ui', mediaType: 'image/png' as const, bytes: 4, width: 1, height: 1 }
    await act(async () => { root.render(createElement(SingleGeneratedImageView, { attachment, prompt: 'test', engine: 'gpt' })) })
    expect(element.querySelector('[role="status"]')?.textContent).toContain('未保存到图库')
    expect(element.querySelector('img')?.getAttribute('src')).toBe('blob:test-image')
    const retry = [...element.querySelectorAll('button')].find(button => button.textContent === '重试保存')!
    await act(async () => { retry.click() })
    expect(save).toHaveBeenCalledTimes(2)
    expect(fetchImage).toHaveBeenCalledTimes(1)
    expect(element.querySelector('[role="status"]')).toBeNull()
    await act(async () => { root.unmount() })
  })
  it('renders the gallery save warning and retries the retained generated image after a gallery refresh', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    Element.prototype.scrollTo = vi.fn()
    vi.spyOn(window, 'prompt').mockReturnValue('retry prompt')
    const attachment = { attachmentId: 'sha256:gallery-original', mediaType: 'image/png', bytes: 4, width: 1, height: 1 }
    const original = { id: attachment.attachmentId, attachment, prompt: 'original', engine: 'gpt', model: 'gpt-image-1', createdAt: 1 }
    gallery.get.mockReset().mockResolvedValue([original])
    save.mockReset().mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    const generated = { ...attachment, attachmentId: 'sha256:gallery-new' }
    const request = vi.fn(async (url: string) => {
      if (url === WORKSPACES_ROUTE) return new Response(JSON.stringify({ workspaces: [] }))
      if (url === CPA_GENERATE_ROUTE) return new Response(JSON.stringify({ attachment: generated, model: 'gpt-image-1' }))
      return new Response(new Blob(['image'], { type: 'image/png' }))
    })
    vi.stubGlobal('fetch', request)
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:gallery-image'), revokeObjectURL: vi.fn() }))
    const element = document.createElement('div'); document.body.appendChild(element)
    const root = createRoot(element)
    await act(async () => { root.render(createElement(GalleryViewTab)) })
    const regenerate = element.querySelector<HTMLButtonElement>('button[title="重新生成"]')!
    expect(regenerate).not.toBeNull()
    await act(async () => { regenerate.click() })
    expect(element.querySelector('[role="status"]')?.textContent).toContain('未保存到图库')
    expect(element.textContent).toContain('retry prompt')
    // A separate persisted-gallery notification must not drop the unsaved image.
    await act(async () => { gallery.notify?.() })
    expect(element.textContent).toContain('retry prompt')
    const retry = [...element.querySelectorAll('button')].find(button => button.textContent === '重试保存到图库')!
    await act(async () => { retry.click() })
    expect(save).toHaveBeenCalledTimes(2)
    expect(save.mock.calls[1]?.[0]?.id).toBe('sha256:gallery-new')
    expect(request.mock.calls.filter(([url]) => url === CPA_GENERATE_ROUTE)).toHaveLength(1)
    expect(element.querySelector('[role="status"]')).toBeNull()
    await act(async () => { root.unmount() })
  })

})
