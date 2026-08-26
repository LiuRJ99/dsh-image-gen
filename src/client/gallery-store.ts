/**
 * Lightweight IndexedDB persistence layer for Image Generation Gallery.
 * Stores lightweight metadata indexes; image binaries remain managed by DSH Attachment service.
 * Supports tombstones to ensure deleted items are never resurrected when revisiting conversations.
 */
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import type { ImageEngine } from '../shared.js'

export type GalleryEngine = ImageEngine | 'unknown'

/** Sort modes exposed by the gallery toolbar (persisted to localStorage). */
export type SortOption = 'time-desc' | 'time-asc' | 'prompt-asc' | 'prompt-desc' | 'size-desc'

/** Layout modes the gallery can render (persisted to localStorage). */
export type ViewMode = 'grid' | 'list' | 'table'

/** Selectable aspect-ratio buckets for the ratio filter. */
export type AspectRatioFilter = 'all' | '1:1' | '16:9' | '9:16' | '4:3' | '3:4' | '3:2' | '2:3'

/** Ordered sort options for the toolbar dropdown. */
export const SORT_OPTIONS: readonly SortOption[] = ['time-desc', 'time-asc', 'prompt-asc', 'prompt-desc', 'size-desc']

/** Ordered ratio buckets for the toolbar dropdown. */
export const ASPECT_RATIO_FILTERS: readonly AspectRatioFilter[] = ['all', '1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3']

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
export type GalleryItemInput = Partial<Omit<GalleryItem, 'engine' | 'model' | 'legacyProvider' | 'legacyEngine' | 'normalizationError' | 'createdAt'>> & {
  createdAt?: number | undefined
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

/** Canonical aspect-ratio bucket for a gallery item, or `undefined` when unknown. */
export function extractAspectRatio(item: GalleryItem): AspectRatioFilter {
  const value = item.aspectRatio ?? item.output
  if (typeof value === 'string' && value.trim() !== '') {
    const match = value.match(/(\d+)\s*:\s*(\d+)/)
    if (match) {
      const w = Number(match[1])
      const h = Number(match[2])
      if (w > 0 && h > 0) {
        const gcd = greatestCommonDivisor(w, h)
        return `${w / gcd}:${h / gcd}` as AspectRatioFilter
      }
    }
  }
  const width = item.attachment?.width
  const height = item.attachment?.height
  if (typeof width === 'number' && typeof height === 'number' && width > 0 && height > 0) {
    const gcd = greatestCommonDivisor(width, height)
    return `${width / gcd}:${height / gcd}` as AspectRatioFilter
  }
  return 'all'
}

/** Format an image resolution, e.g. `1024×1024`, or an empty string when unknown. */
export function formatResolution(item: GalleryItem): string {
  const width = item.attachment?.width
  const height = item.attachment?.height
  if (typeof width === 'number' && typeof height === 'number' && width > 0 && height > 0) {
    return `${width}×${height}`
  }
  const ratio = extractAspectRatio(item)
  return ratio === 'all' ? '' : ratio
}

/** Human-readable file size, e.g. `1.4 MB` / `340 KB` / `12 B`. */
export function formatBytes(bytes: number | undefined | null): string {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${roundOne(kb)} KB`
  const mb = kb / 1024
  if (mb < 1024) return `${roundOne(mb)} MB`
  return `${roundOne(mb / 1024)} GB`
}

/** Formatted creation time, e.g. `2025-05-18 14:30:45`. */
export function formatDate(timestamp: number, lang: 'zh' | 'en' = 'zh'): string {
  if (!Number.isFinite(timestamp)) return '—'
  const ms = timestamp < 1e11 ? timestamp * 1000 : timestamp
  const date = new Date(ms)
  if (Number.isNaN(date.getTime())) return '—'
  const pad = (n: number): string => String(n).padStart(2, '0')
  const ymd = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  const hms = `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  return lang === 'en' ? `${ymd} ${hms}` : `${ymd} ${hms}`
}

/** Compare two gallery items by the active sort option. */
export function compareGalleryItems(a: GalleryItem, b: GalleryItem, sortOption: SortOption): number {
  switch (sortOption) {
    case 'time-asc':
      return a.createdAt - b.createdAt
    case 'prompt-asc':
      return (a.prompt || '').localeCompare(b.prompt || '')
    case 'prompt-desc':
      return (b.prompt || '').localeCompare(a.prompt || '')
    case 'size-desc':
      return (b.attachment?.bytes || 0) - (a.attachment?.bytes || 0)
    case 'time-desc':
    default:
      return b.createdAt - a.createdAt
  }
}

/** Memoizable filter + sort pipeline over the raw gallery list. */
export function processGalleryItems(
  items: readonly GalleryItem[],
  options: { search: string; selectedEngine: string; selectedRatio: AspectRatioFilter; sortOption: SortOption },
): GalleryItem[] {
  const query = options.search.trim().toLowerCase()
  const filtered = items.filter((item) => {
    if (options.selectedEngine !== 'all' && item.engine !== options.selectedEngine) return false
    if (options.selectedRatio !== 'all' && extractAspectRatio(item) !== options.selectedRatio) return false
    if (query !== '' && !(item.prompt || '').toLowerCase().includes(query)) return false
    return true
  })
  return filtered.sort((a, b) => compareGalleryItems(a, b, options.sortOption))
}

/** Count of gallery items for one engine bucket (`all` counts everything). */
export function countByEngine(items: readonly GalleryItem[], engine: string): number {
  if (engine === 'all') return items.length
  return items.reduce((count, item) => (item.engine === engine ? count + 1 : count), 0)
}

function greatestCommonDivisor(a: number, b: number): number {
  let x = a
  let y = b
  while (y !== 0) {
    const next = x % y
    x = y
    y = next
  }
  return x
}

function roundOne(value: number): string {
  const rounded = Math.round(value * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
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
 * Preserves the existing `createdAt` timestamp if already saved and not explicitly provided.
 */
export async function saveGalleryItem(
  item: Omit<GalleryItem, 'createdAt'> & { createdAt?: number | undefined }
): Promise<void> {
  try {
    const db = await getDB()
    const tombstones = await loadTombstones(db)
    if (tombstones.has(item.id)) {
      return
    }

    let existingItem: GalleryItem | undefined
    try {
      existingItem = await new Promise<GalleryItem | undefined>((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readonly')
        const store = tx.objectStore(STORE_NAME)
        const req = store.get(item.id)
        req.onsuccess = () => {
          const res = req.result as GalleryItemInput | undefined
          resolve(res ? normalizeGalleryItem(res) : undefined)
        }
        req.onerror = () => resolve(undefined)
      })
    } catch {
      existingItem = undefined
    }

    const resolvedCreatedAt = item.createdAt ?? existingItem?.createdAt ?? (Math.floor(Date.now() / 1000) * 1000)
    const record = normalizeGalleryItem({
      ...item,
      createdAt: resolvedCreatedAt,
    })

    if (
      existingItem &&
      existingItem.createdAt === record.createdAt &&
      existingItem.engine === record.engine &&
      existingItem.prompt === record.prompt &&
      existingItem.model === record.model &&
      existingItem.output === record.output &&
      existingItem.aspectRatio === record.aspectRatio &&
      existingItem.imageSize === record.imageSize
    ) {
      return
    }

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
