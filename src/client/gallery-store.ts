/**
 * Lightweight IndexedDB persistence layer for Image Generation Gallery.
 * Stores lightweight metadata indexes; image binaries remain managed by DSH Attachment service.
 * Supports tombstones to ensure deleted items are never resurrected when revisiting conversations.
 */
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import type { ImageEngine } from '../shared.js'

export type GalleryEngine = ImageEngine | 'unknown'

export interface GalleryItem {
  id: string
  attachment: ImageAttachmentRef
  prompt: string
  engine: GalleryEngine
  model: string
  createdAt: number
  aspectRatio?: string
  imageSize?: string
  output?: string
  /** Retained only when a legacy record cannot be mapped to an engine. */
  legacyProvider?: string
  /** Retained only when a record contains an unsupported engine value. */
  legacyEngine?: string
  /** Diagnostic for records that cannot be mapped without guessing. */
  normalizationError?: string
}

/**
 * Input accepted by the pure metadata normalizer. The required GalleryItem
 * fields are intentionally optional so legacy metadata-only records can be
 * normalized without constructing browser or Attachment state in tests.
 */
export type GalleryItemInput = Partial<Omit<GalleryItem, 'engine' | 'model' | 'legacyProvider' | 'legacyEngine' | 'normalizationError'>> & {
  engine?: unknown
  model?: unknown
  provider?: unknown
  legacyProvider?: unknown
  legacyEngine?: unknown
  normalizationError?: unknown
}

/** Display label for a normalized engine, including an explicit unknown case. */
export function galleryEngineLabel(engine: GalleryEngine): string {
  if (engine === 'gpt') return 'GPT Image 2'
  if (engine === 'gemini') return 'Gemini Image'
  return 'Unknown image engine'
}

/**
 * Normalize current and legacy Gallery metadata without inferring unknown
 * providers. Legacy OpenAI/Google records are mapped to the CPA engines;
 * unsupported values remain visible as an explicit unknown record.
 */
export function normalizeGalleryItem(item: GalleryItemInput): GalleryItem {
  const {
    engine: rawEngine,
    provider: rawProvider,
    model: rawModel,
    legacyProvider: rawLegacyProvider,
    legacyEngine: rawLegacyEngine,
    normalizationError: rawNormalizationError,
    ...rest
  } = item
  const model = typeof rawModel === 'string' ? rawModel : ''
  const previousLegacyProvider = typeof rawLegacyProvider === 'string' ? rawLegacyProvider : undefined
  const previousLegacyEngine = typeof rawLegacyEngine === 'string' ? rawLegacyEngine : undefined
  const previousError = typeof rawNormalizationError === 'string' ? rawNormalizationError : undefined

  if (rawEngine === 'gpt' || rawEngine === 'gemini') {
    return { ...rest, engine: rawEngine, model } as GalleryItem
  }
  if (rawEngine === 'unknown') {
    const legacyProvider = previousLegacyProvider ?? (typeof rawProvider === 'string' ? rawProvider : undefined)
    return {
      ...rest,
      engine: 'unknown',
      model,
      ...(legacyProvider === undefined ? {} : { legacyProvider }),
      ...(previousLegacyEngine === undefined ? {} : { legacyEngine: previousLegacyEngine }),
      normalizationError: previousError ?? 'Unknown image engine metadata',
    } as GalleryItem
  }
  if (rawEngine !== undefined) {
    const legacyEngine = typeof rawEngine === 'string' ? rawEngine : String(rawEngine)
    return {
      ...rest,
      engine: 'unknown',
      model,
      legacyEngine,
      normalizationError: `Unknown gallery engine "${legacyEngine}"`,
    } as GalleryItem
  }
  if (rawProvider === 'openai') {
    return { ...rest, engine: 'gpt', model } as GalleryItem
  }
  if (rawProvider === 'google') {
    return { ...rest, engine: 'gemini', model } as GalleryItem
  }

  const legacyProvider = typeof rawProvider === 'string' ? rawProvider : previousLegacyProvider
  return {
    ...rest,
    engine: 'unknown',
    model,
    ...(legacyProvider === undefined ? {} : { legacyProvider }),
    normalizationError: legacyProvider === undefined
      ? 'Missing image engine metadata'
      : `Unknown legacy image provider "${legacyProvider}"`,
  } as GalleryItem
}

const DB_NAME = 'dsh_image_gen_db'
const DB_VERSION = 3
const STORE_NAME = 'gallery_history'
const TOMBSTONE_STORE = 'gallery_tombstones'

let dbPromise: Promise<IDBDatabase> | null = null
let tombstonesCache: Set<string> | null = null

function getDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not supported in this environment.'))
      return
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' })
        store.createIndex('createdAt', 'createdAt', { unique: false })
      }
      if (!db.objectStoreNames.contains(TOMBSTONE_STORE)) {
        db.createObjectStore(TOMBSTONE_STORE, { keyPath: 'id' })
      }
    }

    request.onsuccess = () => {
      resolve(request.result)
    }

    request.onerror = () => {
      reject(request.error)
    }
  })
  return dbPromise
}

async function loadTombstones(db: IDBDatabase): Promise<Set<string>> {
  if (tombstonesCache) return tombstonesCache
  return new Promise<Set<string>>((resolve) => {
    if (!db.objectStoreNames.contains(TOMBSTONE_STORE)) {
      tombstonesCache = new Set()
      resolve(tombstonesCache)
      return
    }
    try {
      const tx = db.transaction(TOMBSTONE_STORE, 'readonly')
      const store = tx.objectStore(TOMBSTONE_STORE)
      const req = store.getAllKeys()
      req.onsuccess = () => {
        tombstonesCache = new Set(req.result.map(String))
        resolve(tombstonesCache)
      }
      req.onerror = () => {
        tombstonesCache = new Set()
        resolve(tombstonesCache)
      }
    } catch {
      tombstonesCache = new Set()
      resolve(tombstonesCache)
    }
  })
}

type GalleryListener = () => void
const listeners = new Set<GalleryListener>()

function notifyListeners(): void {
  for (const listener of listeners) {
    try {
      listener()
    } catch (err) {
      console.error('[dsh-image-gen] Gallery listener error:', err)
    }
  }
}

/**
 * Subscribe to gallery mutations (insert/delete/clear).
 */
export function subscribeGallery(listener: GalleryListener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * Save or update a gallery record by attachmentId.
 * Skipped if the item was previously deleted (tombstoned).
 */
export async function saveGalleryItem(
  item: Omit<GalleryItem, 'createdAt'> & { createdAt?: number }
): Promise<void> {
  try {
    const db = await getDB()
    const tombstones = await loadTombstones(db)
    if (tombstones.has(item.id)) {
      return
    }
    const record = normalizeGalleryItem({
      ...item,
      createdAt: item.createdAt ?? Date.now(),
    })
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const req = store.put(record)
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
    notifyListeners()
  } catch (err) {
    console.warn('[dsh-image-gen] Failed to save gallery item to IndexedDB:', err)
  }
}

/**
 * Retrieve all gallery records sorted by createdAt descending.
 */
export async function getGalleryItems(): Promise<GalleryItem[]> {
  try {
    const db = await getDB()
    return await new Promise<GalleryItem[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const index = store.index('createdAt')
      const req = index.openCursor(null, 'prev') // newest first
      const items: GalleryItem[] = []

      req.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result
        if (cursor) {
          items.push(normalizeGalleryItem(cursor.value as GalleryItemInput))
          cursor.continue()
        } else {
          resolve(items)
        }
      }
      req.onerror = () => reject(req.error)
    })
  } catch (err) {
    console.warn('[dsh-image-gen] Failed to read gallery items from IndexedDB:', err)
    return []
  }
}

/**
 * Delete a single gallery record by ID and record a tombstone.
 */
export async function deleteGalleryItem(id: string): Promise<void> {
  try {
    const db = await getDB()
    const tombstones = await loadTombstones(db)
    tombstones.add(id)
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([STORE_NAME, TOMBSTONE_STORE], 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const tombstoneStore = tx.objectStore(TOMBSTONE_STORE)
      store.delete(id)
      tombstoneStore.put({ id, deletedAt: Date.now() })
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    notifyListeners()
  } catch (err) {
    console.warn('[dsh-image-gen] Failed to delete gallery item from IndexedDB:', err)
  }
}

/**
 * Clear all gallery records and reset tombstones.
 */
export async function clearGallery(): Promise<void> {
  try {
    const db = await getDB()
    if (tombstonesCache) tombstonesCache.clear()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([STORE_NAME, TOMBSTONE_STORE], 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const tombstoneStore = tx.objectStore(TOMBSTONE_STORE)
      store.clear()
      tombstoneStore.clear()
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    notifyListeners()
  } catch (err) {
    console.warn('[dsh-image-gen] Failed to clear gallery in IndexedDB:', err)
  }
}
