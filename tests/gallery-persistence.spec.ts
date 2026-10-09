import { IDBDatabase, IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const attachment = { attachmentId: 'sha256:persistence-test', mediaType: 'image/png', bytes: 4, width: 1, height: 1 } as const
const item = { id: attachment.attachmentId, attachment, prompt: 'test', engine: 'gpt' as const, model: 'gpt-image-1', createdAt: 123 }
beforeEach(() => { vi.resetModules(); vi.stubGlobal('indexedDB', new IDBFactory()); vi.spyOn(console, 'warn').mockImplementation(() => {}) })
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })
const load = () => import('../src/client/gallery-store.js')

describe('gallery persistence feedback', () => {
  it('reports an unavailable database rather than pretending the image was saved', async () => {
    vi.stubGlobal('indexedDB', undefined)
    const store = await load()
    expect(await store.saveGalleryItem(item)).toBe(false)
  })

  it('retries after an opening failure and reports a later successful commit', async () => {
    const factory = globalThis.indexedDB
    vi.spyOn(factory, 'open').mockImplementationOnce(() => { throw new Error('open failed') })
    const store = await load()
    expect(await store.saveGalleryItem(item)).toBe(false)
    expect(await store.saveGalleryItem(item)).toBe(true)
    expect(await store.getGalleryItems()).toHaveLength(1)
  })

  it('reports an aborted transaction and permits a successful retry', async () => {
    const store = await load(); const original = IDBDatabase.prototype.transaction
    vi.spyOn(IDBDatabase.prototype, 'transaction').mockImplementationOnce(function (...args) {
      const tx = original.apply(this, args); queueMicrotask(() => tx.abort()); return tx
    })
    expect(await store.saveGalleryItem(item)).toBe(false)
    expect(await store.saveGalleryItem(item)).toBe(true)
    expect(await store.getGalleryItems()).toHaveLength(1)
  })

  it('preserves favorites, workspace and creation time when re-saving the same attachment', async () => {
    const store = await load()
    expect(await store.saveGalleryItem({ ...item, isFavorite: true, tags: ['keep'], workspacePath: '/test/workspace', savedTo: '/test/image.png' })).toBe(true)
    expect(await store.saveGalleryItem({ ...item, createdAt: 999, prompt: 'updated' })).toBe(true)
    expect((await store.getGalleryItems())[0]).toMatchObject({ isFavorite: true, tags: ['keep'], createdAt: 123, workspacePath: '/test/workspace', savedTo: '/test/image.png', prompt: 'updated' })
  })

  it('keeps intentional tombstones successful without resurrecting deleted images', async () => {
    const store = await load(); await store.saveGalleryItem(item); await store.deleteGalleryItem(item.id)
    expect(await store.saveGalleryItem(item)).toBe(true)
    expect(await store.getGalleryItems()).toEqual([])
  })
})
