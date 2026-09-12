import { afterEach, describe, expect, it, vi } from 'vitest'
import { createServer, type Server } from 'node:http'

import { CanvasMirror, type CanvasSelectionImage } from '../src/canvas-state.js'
import { decodeSelectionImage, parseCanvasStatePush, serveCanvasState, type CanvasStateRouteDeps } from '../src/canvas-state-route.js'
import { resolveCanvasSelectionReferences, type CanvasSelectionImageStore } from '../src/canvas-tools.js'
import type { ReferenceImageAgent } from '../src/reference-image.js'
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import type { Message } from '@deepseek-ai/dsh-llm'
import type { CanvasNodeSummary, CanvasStatePush } from '../src/shared.js'

/** 1x1 transparent PNG. */
const TINY_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

function attachmentRef(id: string): ImageAttachmentRef {
  return { attachmentId: id, mediaType: 'image/png', bytes: 70, width: 1, height: 1, name: 'canvas-selection' }
}

/** Distinct in-memory screenshot bytes, mirroring what the route decodes. */
function selImage(tag = 9): CanvasSelectionImage {
  return { data: new Uint8Array([tag, 9, 9]), mediaType: 'image/png' }
}

function validPush(overrides: Partial<CanvasStatePush> = {}): CanvasStatePush {
  return parseCanvasStatePush({
    clientInstance: 'editor-1',
    connected: true,
    nodeCount: 2,
    nodes: [
      { kind: 'image', galleryId: 'g1', attachmentId: 'sha256:abc', name: 'generated-image', width: 1024, height: 768 },
      { kind: 'draw' },
    ],
    selection: { count: 1, kinds: ['draw'], items: [{ kind: 'draw' }] },
    updatedAt: Date.now(),
    ...overrides,
  }) as CanvasStatePush
}

describe('canvas state push validation', () => {
  it('accepts a full push and normalizes optional fields', () => {
    const push = validPush()
    expect(push).toBeDefined()
    expect(push?.clientInstance).toBe('editor-1')
    expect(push?.nodes).toHaveLength(2)
    expect(push?.selection?.kinds).toEqual(['draw'])
  })

  it('accepts a bare disconnect push', () => {
    const push = parseCanvasStatePush({ clientInstance: 'editor-1', connected: false, nodeCount: 0, updatedAt: Date.now() })
    expect(push).toMatchObject({ clientInstance: 'editor-1', connected: false, nodeCount: 0 })
  })

  it('rejects malformed payloads', () => {
    expect(parseCanvasStatePush(null)).toBeUndefined()
    expect(parseCanvasStatePush({})).toBeUndefined()
    expect(parseCanvasStatePush({ clientInstance: '', connected: true, nodeCount: 0, updatedAt: Date.now() })).toBeUndefined()
    expect(parseCanvasStatePush({ clientInstance: 'e', connected: 'yes', nodeCount: 0, updatedAt: Date.now() })).toBeUndefined()
    expect(parseCanvasStatePush({ clientInstance: 'e', connected: true, nodeCount: -1, updatedAt: Date.now() })).toBeUndefined()
    expect(parseCanvasStatePush({ clientInstance: 'e', connected: true, nodeCount: 0, updatedAt: 'now' })).toBeUndefined()
  })

  it('rejects unknown node kinds and bad node fields', () => {
    const base = { clientInstance: 'e', connected: true, nodeCount: 1, updatedAt: Date.now() }
    expect(parseCanvasStatePush({ ...base, nodes: [{ kind: 'hologram' }] })).toBeUndefined()
    expect(parseCanvasStatePush({ ...base, nodes: [{ kind: 'draw', text: 42 }] })).toBeUndefined()
    expect(parseCanvasStatePush({ ...base, selection: { count: 1, kinds: ['nope'] } })).toBeUndefined()
  })

  it('parses selection items and rejects inconsistent ones', () => {
    const base = { clientInstance: 'e', connected: true, nodeCount: 1, updatedAt: Date.now() }
    const withItems = parseCanvasStatePush({
      ...base,
      selection: { count: 2, kinds: ['image'], items: [{ kind: 'image', name: 'a', width: 1024, height: 768 }, { kind: 'image', name: 'b' }] },
    })
    expect(withItems?.selection?.items).toHaveLength(2)
    expect(withItems?.selection?.items?.[1]).toMatchObject({ kind: 'image', name: 'b' })
    // items is a capped prefix of the selection: longer than count is contradictory.
    expect(parseCanvasStatePush({ ...base, selection: { count: 1, kinds: ['image'], items: [{ kind: 'image' }, { kind: 'image' }] } })).toBeUndefined()
    // A malformed item rejects the whole push.
    expect(parseCanvasStatePush({ ...base, selection: { count: 1, kinds: ['image'], items: [{ kind: 'hologram' }] } })).toBeUndefined()
    expect(parseCanvasStatePush({ ...base, selection: { count: 1, kinds: ['image'], items: [{ kind: 'image', width: 'big' }] } })).toBeUndefined()
  })

  it('rejects timestamps far from now', () => {
    expect(parseCanvasStatePush({ clientInstance: 'e', connected: true, nodeCount: 0, updatedAt: Date.now() - 10 * 60_000 })).toBeUndefined()
  })

  it('decodes valid selection screenshots and rejects anything else', () => {
    const decoded = decodeSelectionImage(`data:image/png;base64,${TINY_PNG_BASE64}`)
    expect(decoded?.mediaType).toBe('image/png')
    expect(decoded?.data.byteLength).toBeGreaterThan(0)
    expect(decodeSelectionImage('data:image/png;base64,%%%')).toBeUndefined()
    expect(decodeSelectionImage('data:image/svg+xml;base64,PHN2Zw==')).toBeUndefined()
    expect(decodeSelectionImage('http://example.com/x.png')).toBeUndefined()
  })
})

describe('canvas mirror digest', () => {
  it('reports a clear not-connected state', () => {
    const mirror = new CanvasMirror()
    const digest = mirror.digest()
    expect(digest).toContain('not connected')
    expect(mirror.connected()).toBe(false)
    expect(mirror.latest()).toBeUndefined()
  })

  it('inventories shapes, selections, and selection screenshots', () => {
    const mirror = new CanvasMirror()
    mirror.apply(validPush(), selImage())
    const digest = mirror.digest()
    expect(digest).toContain('2 shapes')
    expect(digest).toContain('1 image')
    expect(digest).toContain('conversation attachment sha256:abc')
    expect(digest).toContain('draw (freehand stroke)')
    expect(digest).toContain('Selection: 1 shape (draw)')
    expect(digest).toContain('selected: draw (freehand stroke)')
    expect(digest).toContain('view_canvas')
    expect(mirror.latestSelectionImage()?.data).toEqual(new Uint8Array([9, 9, 9]))
  })

  it('keeps the previous screenshot when an unchanged selection is re-pushed', () => {
    const mirror = new CanvasMirror()
    mirror.apply(validPush(), selImage())
    // Same selection signature, no new image in the push.
    mirror.apply(validPush())
    expect(mirror.latestSelectionImage()?.data).toEqual(new Uint8Array([9, 9, 9]))
    // A different selection without a new screenshot drops the stale one.
    const changed = validPush({ selection: { count: 2, kinds: ['draw', 'text'], items: [{ kind: 'draw' }, { kind: 'text', text: 'hi' }] } })
    mirror.apply(changed)
    expect(mirror.latestSelectionImage()).toBeUndefined()
  })

  it('drops the stale screenshot when the selection swaps between same-kind shapes', () => {
    const mirror = new CanvasMirror()
    // The regression this guards: count and kinds match across the swap, so
    // only the item identity tells the two selections apart.
    const lion = validPush({ selection: { count: 1, kinds: ['image'], items: [{ kind: 'image', name: 'lion', width: 1024, height: 1024 }] } })
    mirror.apply(lion, selImage(1))
    expect(mirror.latestSelectionImage()?.data).toEqual(new Uint8Array([1, 9, 9]))
    const monster = validPush({ selection: { count: 1, kinds: ['image'], items: [{ kind: 'image', name: 'monster', width: 1024, height: 1024 }] } })
    mirror.apply(monster)
    expect(mirror.latestSelectionImage()).toBeUndefined()
    expect(mirror.latest()?.selectionItems).toEqual([{ kind: 'image', name: 'monster', width: 1024, height: 1024 }])
  })

  it('removes an instance on disconnect and prefers the freshest instance', () => {
    const mirror = new CanvasMirror()
    mirror.apply(validPush())
    const second = validPush({ clientInstance: 'editor-2', nodeCount: 5 })
    mirror.apply(second)
    expect(mirror.latest()?.clientInstance).toBe('editor-2')
    mirror.apply({ clientInstance: 'editor-2', connected: false, nodeCount: 0, updatedAt: Date.now() })
    expect(mirror.latest()?.clientInstance).toBe('editor-1')
    mirror.apply({ clientInstance: 'editor-1', connected: false, nodeCount: 0, updatedAt: Date.now() })
    expect(mirror.latest()).toBeUndefined()
  })

  it('collapses long node lists', () => {
    const mirror = new CanvasMirror()
    const nodes = Array.from({ length: 40 }, () => ({ kind: 'draw' as const }))
    mirror.apply(validPush({ nodeCount: 40, nodes, selection: undefined }))
    const digest = mirror.digest()
    expect(digest).toContain('40 shapes')
    expect(digest).toContain('more shapes omitted')
    expect(digest).toContain('Selection: none')
  })
})

describe('canvas selection reference resolution', () => {
  const signal = new AbortController().signal

  /** Conversation whose newest message carries the given image attachments. */
  function conversationWithImages(...ids: string[]): ReferenceImageAgent {
    const messages = [{
      source: { kind: 'user' },
      content: ids.map(id => ({ type: 'image', attachment: attachmentRef(id) })),
    }] as unknown as Message[]
    return { session: { deriveMessages: () => messages } }
  }

  /** Selection of conversation images (by attachment id) plus optional extra items. */
  function selectionPush(attachmentIds: string[], extraItems: CanvasNodeSummary[] = []): CanvasStatePush {
    const items: CanvasNodeSummary[] = [
      ...attachmentIds.map(id => ({ kind: 'image' as const, attachmentId: id, name: `image-${id}`, width: 1024, height: 768 })),
      ...extraItems,
    ]
    return validPush({ selection: { count: items.length, kinds: ['image'], items } })
  }

  /** Attachment store that records read order and serves distinct bytes per read. */
  function tracingStore(): { store: CanvasSelectionImageStore; reads: string[] } {
    const reads: string[] = []
    const store: CanvasSelectionImageStore = {
      readImage: async ref => {
        reads.push(String(ref.attachmentId))
        return { ref, data: new Uint8Array([reads.length, 2, 3]) }
      },
    }
    return { store, reads }
  }

  it('resolves a pure conversation-image selection to full-resolution originals only', async () => {
    const mirror = new CanvasMirror()
    mirror.apply(selectionPush(['sha256:abc', 'sha256:def']), selImage())
    const { store, reads } = tracingStore()
    const result = await resolveCanvasSelectionReferences({
      mirror,
      attachments: store,
      agent: conversationWithImages('sha256:abc', 'sha256:def'),
      signal,
    })
    expect(result).toEqual([
      { data: new Uint8Array([1, 2, 3]), mediaType: 'image/png' },
      { data: new Uint8Array([2, 2, 3]), mediaType: 'image/png' },
    ])
    // The screenshot stays out: originals alone cover a pure image selection.
    expect(reads).toEqual(['sha256:abc', 'sha256:def'])
  })

  it('appends the screenshot after originals for mixed selections', async () => {
    const mirror = new CanvasMirror()
    mirror.apply(selectionPush(['sha256:abc'], [{ kind: 'draw' }]), selImage())
    const { store, reads } = tracingStore()
    const result = await resolveCanvasSelectionReferences({
      mirror,
      attachments: store,
      agent: conversationWithImages('sha256:abc'),
      signal,
    })
    expect(result).toEqual([
      { data: new Uint8Array([1, 2, 3]), mediaType: 'image/png' },
      { data: new Uint8Array([9, 9, 9]), mediaType: 'image/png' },
    ])
    // The screenshot comes from mirror memory; only the original is read.
    expect(reads).toEqual(['sha256:abc'])
  })

  it('falls back to the screenshot when the attachment is not in the conversation', async () => {
    const mirror = new CanvasMirror()
    mirror.apply(selectionPush(['sha256:ghost']), selImage())
    const { store, reads } = tracingStore()
    const result = await resolveCanvasSelectionReferences({
      mirror,
      attachments: store,
      agent: conversationWithImages('sha256:abc'),
      signal,
    })
    expect(result).toEqual([{ data: new Uint8Array([9, 9, 9]), mediaType: 'image/png' }])
    // The in-memory screenshot resolves without touching the store at all.
    expect(reads).toEqual([])
  })

  it('uses the mirrored selection screenshot when no agent session is available', async () => {
    const mirror = new CanvasMirror()
    mirror.apply(selectionPush(['sha256:abc']), selImage())
    const { store, reads } = tracingStore()
    const result = await resolveCanvasSelectionReferences({ mirror, attachments: store, signal })
    expect(result).toEqual([{ data: new Uint8Array([9, 9, 9]), mediaType: 'image/png' }])
    expect(reads).toEqual([])
  })

  it('fails with actionable guidance when no canvas is connected', async () => {
    const mirror = new CanvasMirror()
    await expect(resolveCanvasSelectionReferences({
      mirror,
      attachments: { readImage: async () => { throw new Error('unreadable') } },
      signal,
    })).rejects.toThrow(/not connected/)
  })

  it('fails when the canvas has an empty selection', async () => {
    const mirror = new CanvasMirror()
    mirror.apply(validPush({ selection: { count: 0, kinds: [] } }))
    await expect(resolveCanvasSelectionReferences({
      mirror,
      attachments: { readImage: async () => { throw new Error('unreadable') } },
      signal,
    })).rejects.toThrow(/no selection/)
  })

  it('fails with retry guidance when a draw-only selection has no screenshot', async () => {
    const mirror = new CanvasMirror()
    mirror.apply(validPush())
    await expect(resolveCanvasSelectionReferences({
      mirror,
      attachments: { readImage: async () => { throw new Error('unreadable') } },
      signal,
    })).rejects.toThrow(/no usable reference/)
  })

  it('enforces the byte budget on originals', async () => {
    const mirror = new CanvasMirror()
    mirror.apply(selectionPush(['sha256:abc']), attachmentRef('sha256:sel'))
    await expect(resolveCanvasSelectionReferences({
      mirror,
      attachments: { readImage: async ref => ({ ref, data: new Uint8Array(10) }) },
      agent: conversationWithImages('sha256:abc'),
      maxBytes: 4,
      signal,
    })).rejects.toThrow(/too large/)
  })
})

describe('canvas state route', () => {
  let server: Server
  let serverUrl: string
  let mirror: CanvasMirror

  function deps(): CanvasStateRouteDeps {
    return {
      mirror,
      maxBodyBytes: 1024 * 1024,
      maxImageBytes: 1024 * 1024,
    }
  }

  afterEach(async () => {
    if (server !== undefined) await new Promise<void>(resolve => server.close(() => resolve()))
    vi.unstubAllGlobals()
  })

  function start(): Promise<void> {
    mirror = new CanvasMirror()
    server = createServer((req, res) => {
      void serveCanvasState(req, res, deps()).catch(() => { res.statusCode = 500; res.end() })
    })
    return new Promise<void>(resolve => {
      server.listen(0, '127.0.0.1', () => {
        serverUrl = `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}`
        resolve()
      })
    })
  }

  it('accepts a push with a screenshot into memory without persisting anything', async () => {
    await start()
    const response = await fetch(serverUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...validPush(), selectionImage: `data:image/png;base64,${TINY_PNG_BASE64}` }),
    })
    await expect(response.json()).resolves.toMatchObject({ ok: true })
    // The decoded bytes live in the mirror only — no durable store involved.
    const image = mirror.latest()?.selectionImage
    expect(image?.mediaType).toBe('image/png')
    expect(image?.data.byteLength).toBeGreaterThan(0)
    expect(mirror.latestSelectionImage()).toBe(image)
  })

  it('stores a push without a screenshot and disconnects cleanly', async () => {
    await start()
    const ok = await fetch(serverUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(validPush()),
    })
    expect(ok.status).toBe(200)
    expect(mirror.connected()).toBe(true)
    expect(mirror.latestSelectionImage()).toBeUndefined()

    await fetch(serverUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ clientInstance: 'editor-1', connected: false, nodeCount: 0, updatedAt: Date.now() }),
    })
    expect(mirror.connected()).toBe(false)
  })

  it('rejects wrong methods, content types, and cross-origin calls', async () => {
    await start()
    expect((await fetch(serverUrl, { method: 'GET' })).status).toBe(405)
    expect((await fetch(serverUrl, { method: 'POST', body: 'x' })).status).toBe(415)
    expect((await fetch(serverUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://evil.example.com' },
      body: JSON.stringify(validPush()),
    })).status).toBe(403)
  })

  it('rejects invalid payloads and oversized screenshots', async () => {
    await start()
    const invalid = await fetch(serverUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ clientInstance: 'x' }),
    })
    expect(invalid.status).toBe(400)
    expect(mirror.latest()).toBeUndefined()

    const huge = await fetch(serverUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...validPush(), selectionImage: 'data:image/png;base64,not-base64' }),
    })
    expect(huge.status).toBe(400)
    expect(mirror.latest()?.selectionImage).toBeUndefined()
  })
})
