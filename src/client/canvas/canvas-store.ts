/**
 * IndexedDB persistence for the canvas workspace plus the cross-view import
 * bridge: conversation image cards enqueue pending imports, the canvas tab
 * drains them (live when open, on mount otherwise). Mirrors gallery-store's
 * schemaless pattern so optional fields never need a version bump.
 */
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import type { CanvasDocument } from './canvas-model.js'

const DB_NAME = 'dsh_image_gen_canvas'
const DB_VERSION = 1
const DOC_STORE = 'canvas_docs'
const PENDING_STORE = 'canvas_pending'
const DOC_KEY = 'default'

export interface PendingCanvasImport {
  id: string
  attachment: ImageAttachmentRef
  prompt?: string
  provider?: string
  model?: string
  createdAt: number
  sourceAttachmentIds?: string[]
}

let dbPromise: Promise<IDBDatabase> | null = null

function getDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not supported in this environment.'))
      return
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(DOC_STORE)) db.createObjectStore(DOC_STORE)
      if (!db.objectStoreNames.contains(PENDING_STORE)) db.createObjectStore(PENDING_STORE, { keyPath: 'id' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  return dbPromise
}

export async function loadCanvasDocument(): Promise<CanvasDocument | undefined> {
  try {
    const db = await getDB()
    return await new Promise<CanvasDocument | undefined>((resolve, reject) => {
      const tx = db.transaction(DOC_STORE, 'readonly')
      const req = tx.objectStore(DOC_STORE).get(DOC_KEY)
      req.onsuccess = () => resolve(req.result as CanvasDocument | undefined)
      req.onerror = () => reject(req.error)
    })
  } catch {
    return undefined
  }
}

export async function saveCanvasDocument(doc: CanvasDocument): Promise<void> {
  try {
    const db = await getDB()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(DOC_STORE, 'readwrite')
      tx.objectStore(DOC_STORE).put(doc, DOC_KEY)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    // Canvas persistence is best-effort; in-memory state stays usable.
  }
}

type CanvasListener = () => void
const listeners = new Set<CanvasListener>()

/** Subscribe to pending-import arrivals so an open canvas can drain live. */
export function subscribeCanvas(listener: CanvasListener): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/** Enqueue one conversation image for the canvas. Fire-and-forget safe. */
export async function enqueuePendingCanvasImport(item: Omit<PendingCanvasImport, 'id' | 'createdAt'> & { createdAt?: number }): Promise<void> {
  try {
    const record: PendingCanvasImport = {
      id: item.attachment.attachmentId,
      attachment: item.attachment,
      ...(item.prompt !== undefined ? { prompt: item.prompt } : {}),
      ...(item.provider !== undefined ? { provider: item.provider } : {}),
      ...(item.model !== undefined ? { model: item.model } : {}),
      ...(Array.isArray(item.sourceAttachmentIds) ? { sourceAttachmentIds: [...item.sourceAttachmentIds] } : {}),
      createdAt: item.createdAt ?? Date.now(),
    }
    const db = await getDB()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(PENDING_STORE, 'readwrite')
      tx.objectStore(PENDING_STORE).put(record)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    for (const listener of listeners) {
      try { listener() } catch (err) { console.error('[dsh-image-gen] canvas listener error:', err) }
    }
  } catch {
    // Enqueueing happens from ephemeral cards; losing one is tolerable.
  }
}

/** Read and clear the pending-import queue. */
export async function drainPendingCanvasImports(): Promise<PendingCanvasImport[]> {
  try {
    const db = await getDB()
    const records = await new Promise<PendingCanvasImport[]>((resolve, reject) => {
      const tx = db.transaction(PENDING_STORE, 'readonly')
      const req = tx.objectStore(PENDING_STORE).getAll()
      req.onsuccess = () => resolve(req.result as PendingCanvasImport[])
      req.onerror = () => reject(req.error)
    })
    if (records.length === 0) return []
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(PENDING_STORE, 'readwrite')
      tx.objectStore(PENDING_STORE).clear()
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    return records
  } catch {
    return []
  }
}
