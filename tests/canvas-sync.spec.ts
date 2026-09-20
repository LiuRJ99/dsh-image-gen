import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Editor } from 'tldraw'
import { startCanvasSync } from '../src/client/tl/canvas-sync.js'
import { CANVAS_STATE_ROUTE } from '../src/shared.js'

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

function fixture(count: number) {
  const shapes = Array.from({ length: count }, (_, n) => ({ id: `shape:${n}`, type: 'image', meta: {}, props: { assetId: `asset:${n}`, w: 1024, h: 1024 } }))
  const assets = shapes.map((s, n) => ({ id: s.props.assetId, type: 'image', props: { src: `data:image/png;base64,AA${n}=`, name: `image-${n}`, w: 1024, h: 1024 } }))
  let listener: (event: unknown) => void = () => {}
  const editor = {
    id: 'editor-test', getCurrentPageShapes: () => shapes, getSelectedShapes: () => shapes,
    getSelectedShapeIds: () => shapes.map(s => s.id), getSelectionPageBounds: () => ({ w: 2048, h: 2048 }),
    getAsset: (id: string) => assets.find(a => a.id === id),
    resolveAssetUrl: async (id: string) => assets.find(a => a.id === id)?.props.src,
    store: { listen: (fn: typeof listener) => { listener = fn; return () => {} } },
    toImageDataUrl: vi.fn().mockResolvedValueOnce({ url: 'data:image/png;base64,' + 'A'.repeat(7_000_000) }).mockResolvedValue({ url: 'data:image/jpeg;base64,AQID' }),
  }
  const pushes: any[] = []
  let uploads = 0
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.startsWith('data:')) return new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/png' } })
    if (url === CANVAS_STATE_ROUTE) {
      pushes.push(JSON.parse(String(init?.body)))
      return Response.json({ ok: true })
    }
    if (!init?.method || init.method === 'GET') return Response.json({ maxImageBytes: 5_000_000 })
    uploads++
    return Response.json({ attachment: { attachmentId: `sha256:${uploads}`, mediaType: 'image/png', bytes: 3, width: 1024, height: 1024 } })
  })
  vi.stubGlobal('fetch', fetchMock)
  return { editor: editor as unknown as Editor, exportImage: editor.toImageDataUrl, pushes, fetchMock, change: () => listener({ changes: { added: {}, removed: {}, updated: { shape: [{ typeName: 'shape' }, { typeName: 'shape' }] } } }) }
}

describe('canvas selection sync', () => {
  it.each([2, 4])('keeps a usable preview when %i selected images exceed the PNG budget', async count => {
    vi.useFakeTimers()
    const f = fixture(count)
    const stop = startCanvasSync(f.editor)
    await vi.advanceTimersByTimeAsync(2000)
    expect(f.pushes.some(push => push.selectionImage === 'data:image/jpeg;base64,AQID')).toBe(true)
    expect(f.exportImage.mock.calls.length).toBeGreaterThan(1)
    stop()
  })

  it('sends all four originals as durable references, independent of conversation history', async () => {
    vi.useFakeTimers()
    const f = fixture(4)
    const stop = startCanvasSync(f.editor)
    await vi.advanceTimersByTimeAsync(2000)
    const ready = f.pushes.findLast(p => p.selectionStatus === 'ready')
    expect(ready?.selection.items.map((item: any) => item.attachment?.attachmentId)).toEqual(['sha256:1', 'sha256:2', 'sha256:3', 'sha256:4'])
    stop()
  })
})
