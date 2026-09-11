/**
 * Lightweight IndexedDB persistence layer for Image Generation Gallery.
 * Stores lightweight metadata indexes; image binaries remain managed by DSH Attachment service.
 * Supports tombstones to ensure deleted items are never resurrected when revisiting conversations.
 */
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import { attachmentMeta, imageAttachment } from '../shared.js'
import type { ImageEngine } from '../shared.js'

export type GalleryEngine = ImageEngine | 'unknown'

/** IndexedDB schema version retained by the fork; optional fields are schemaless. */
export const GALLERY_DB_VERSION = 3

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
  /** Persisted user favorite; optional for DB v3 records written by older builds. */
  isFavorite?: boolean
  /** Optional user labels, retained across automatic gallery re-indexing. */
  tags?: string[]
  /** Workspace metadata used only for filtering and safe file cleanup. */
  workspacePath?: string
  workspaceId?: string
  sessionId?: string
  /** Absolute path returned by the safe host workspace save, when present. */
  savedTo?: string
  /** Stable workspace-save diagnostic when generation itself succeeded. */
  saveError?: string
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

const PROMPT_COLLATOR = new Intl.Collator('zh-CN-u-co-pinyin', { sensitivity: 'base', numeric: true })

/** Compare two gallery items with a deterministic locale and id tie-breaker. */
export function compareGalleryItems(a: GalleryItem, b: GalleryItem, sortOption: SortOption): number {
  let result: number
  switch (sortOption) {
    case 'time-asc':
      result = a.createdAt - b.createdAt
      break
    case 'prompt-asc':
      result = PROMPT_COLLATOR.compare(a.prompt || '', b.prompt || '')
      break
    case 'prompt-desc':
      result = PROMPT_COLLATOR.compare(b.prompt || '', a.prompt || '')
      break
    case 'size-desc':
      result = (b.attachment?.bytes || 0) - (a.attachment?.bytes || 0)
      break
    case 'time-desc':
    default:
      result = b.createdAt - a.createdAt
      break
  }
  return result !== 0 ? result : PROMPT_COLLATOR.compare(a.id, b.id)
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

function sanitizeGalleryRest(value: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  if (typeof value.id === 'string' && value.id.trim() !== '') result.id = value.id
  const attachment = imageAttachment(value.attachment)
  if (attachment !== undefined) result.attachment = imageAttachment(attachmentMeta(attachment))
  if (typeof value.prompt === 'string') result.prompt = value.prompt.slice(0, 32_000)
  const limits: Record<string, number> = { aspectRatio: 32, imageSize: 32, output: 256, workspacePath: 4096, workspaceId: 256, sessionId: 256, savedTo: 4096, saveError: 256 }
  for (const key of Object.keys(limits)) {
    if (typeof value[key] === 'string') result[key] = value[key].slice(0, limits[key] ?? 256)
  }
  if (typeof value.isFavorite === 'boolean') result.isFavorite = value.isFavorite
  if (Array.isArray(value.tags)) {
    const tags = value.tags.filter((tag): tag is string => typeof tag === 'string').slice(0, 64)
    result.tags = tags
  }
  if (typeof value.createdAt === 'number' && Number.isFinite(value.createdAt)) result.createdAt = value.createdAt
  return result
}

/**
 * Normalize current and legacy Gallery metadata without inferring unknown
 * providers. Legacy OpenAI/Google records are mapped to the CPA engines;
 * unsupported values remain visible as an explicit unknown record.
 */
export function normalizeGalleryItem(item: GalleryItemInput): GalleryItem {
  if (typeof item !== 'object' || item === null || Array.isArray(item)) {
    return { engine: 'unknown', model: '', normalizationError: 'Invalid gallery metadata' } as GalleryItem
  }
  const {
    engine: rawEngine,
    provider: rawProvider,
    model: rawModel,
    legacyProvider: rawLegacyProvider,
    legacyEngine: rawLegacyEngine,
    normalizationError: rawNormalizationError,
    ...rest
  } = item
  const normalizedRest = sanitizeGalleryRest(rest)
  const model = typeof rawModel === 'string' ? rawModel.slice(0, 256) : ''
  const previousLegacyProvider = typeof rawLegacyProvider === 'string' ? rawLegacyProvider.slice(0, 128) : undefined
  const previousLegacyEngine = typeof rawLegacyEngine === 'string' ? rawLegacyEngine.slice(0, 128) : undefined
  const previousError = typeof rawNormalizationError === 'string' ? rawNormalizationError.slice(0, 256) : undefined

  if (rawEngine === 'gpt' || rawEngine === 'gemini') {
    return { ...normalizedRest, engine: rawEngine, model } as GalleryItem
  }
  if (rawEngine === 'unknown') {
    const legacyProvider = previousLegacyProvider ?? (typeof rawProvider === 'string' ? rawProvider.slice(0, 128) : undefined)
    return {
      ...normalizedRest,
      engine: 'unknown',
      model,
      ...(legacyProvider === undefined ? {} : { legacyProvider }),
      ...(previousLegacyEngine === undefined ? {} : { legacyEngine: previousLegacyEngine }),
      normalizationError: previousError ?? 'Unknown image engine metadata',
    } as GalleryItem
  }
  if (rawEngine !== undefined) {
    const legacyEngine = typeof rawEngine === 'string' ? rawEngine : typeof rawEngine === 'number' || typeof rawEngine === 'boolean' ? String(rawEngine) : 'invalid'
    return {
      ...normalizedRest,
      engine: 'unknown',
      model,
      legacyEngine,
      normalizationError: `Unknown gallery engine "${legacyEngine}"`,
    } as GalleryItem
  }
  if (rawProvider === 'openai') {
    return { ...normalizedRest, engine: 'gpt', model } as GalleryItem
  }
  if (rawProvider === 'google') {
    return { ...normalizedRest, engine: 'gemini', model } as GalleryItem
  }

  const legacyProvider = typeof rawProvider === 'string' ? rawProvider.slice(0, 128) : previousLegacyProvider
  return {
    ...normalizedRest,
    engine: 'unknown',
    model,
    ...(legacyProvider === undefined ? {} : { legacyProvider }),
    normalizationError: legacyProvider === undefined
      ? 'Missing image engine metadata'
      : `Unknown legacy image provider "${legacyProvider}"`,
  } as GalleryItem
}

const DB_NAME = 'dsh_image_gen_db'
const DB_VERSION = GALLERY_DB_VERSION
const STORE_NAME = 'gallery_history'
const TOMBSTONE_STORE = 'gallery_tombstones'

let dbPromise: Promise<IDBDatabase> | null = null
let tombstonesCache: Set<string> | null = null

function getDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('IndexedDB is not supported in this environment.'))

  let request: IDBOpenDBRequest
  try {
    request = indexedDB.open(DB_NAME, DB_VERSION)
  } catch (error) {
    return Promise.reject(error)
  }

  const promise = new Promise<IDBDatabase>((resolve, reject) => {
    const reset = () => {
      if (dbPromise === promise) {
        dbPromise = null
        tombstonesCache = null
      }
    }

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' })
        store.createIndex('createdAt', 'createdAt', { unique: false })
      } else {
        const upgradeTransaction = (event.target as IDBOpenDBRequest).transaction
        if (upgradeTransaction !== null && !upgradeTransaction.objectStore(STORE_NAME).indexNames.contains('createdAt')) {
          upgradeTransaction.objectStore(STORE_NAME).createIndex('createdAt', 'createdAt', { unique: false })
        }
      }
      if (!db.objectStoreNames.contains(TOMBSTONE_STORE)) {
        db.createObjectStore(TOMBSTONE_STORE, { keyPath: 'id' })
      }
    }

    request.onsuccess = () => {
      const db = request.result
      db.onversionchange = () => {
        db.close()
        reset()
      }
      resolve(db)
    }

    request.onerror = () => {
      reset()
      reject(request.error ?? new Error('IndexedDB open failed'))
    }
    request.onblocked = () => {
      reset()
      reject(new Error('IndexedDB open blocked by another tab'))
    }
  })
  dbPromise = promise
  return promise
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
        tombstonesCache = new Set((req.result ?? []).map(String))
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
 * Skipped if the item was previously deleted (tombstoned). Existing user
 * metadata (favorite, tags and workspace path) survives automatic re-indexing.
 */
export async function saveGalleryItem(
  item: Omit<GalleryItem, 'createdAt'> & { createdAt?: number | undefined }
): Promise<void> {
  try {
    const db = await getDB()
    const candidate = normalizeGalleryItem({
      ...item,
      createdAt: item.createdAt ?? (Math.floor(Date.now() / 1000) * 1000),
    })
    const changed = await upsertGalleryItem(db, candidate)
    if (changed) notifyListeners()
  } catch (err) {
    console.warn('[dsh-image-gen] Failed to save gallery item to IndexedDB:', err)
  }
}

async function upsertGalleryItem(db: IDBDatabase, candidate: GalleryItem): Promise<boolean> {
  return new Promise<boolean>((resolve, reject) => {
    const tx = db.transaction([STORE_NAME, TOMBSTONE_STORE], 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const tombstoneStore = tx.objectStore(TOMBSTONE_STORE)
    let changed = false
    let blocked = false
    const tombstoneRequest = tombstoneStore.get(candidate.id)
    tombstoneRequest.onsuccess = () => {
      if (tombstoneRequest.result !== undefined) {
        blocked = true
        return
      }
      const req = store.get(candidate.id)
      req.onsuccess = () => {
        const existingRaw = req.result as GalleryItemInput | undefined
        const existing = existingRaw === undefined ? undefined : normalizePersistedGalleryItem(existingRaw)
        const merged = mergeGalleryItem(existing, candidate)
        if (existing !== undefined && galleryItemsEqual(existing, merged)) return
        changed = true
        const put = store.put(merged)
        put.onerror = () => reject(put.error)
      }
      req.onerror = () => reject(req.error)
    }
    tombstoneRequest.onerror = () => reject(tombstoneRequest.error)
    tx.oncomplete = () => resolve(!blocked && changed)
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'))
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'))
  })
}

function mergeGalleryItem(existing: GalleryItem | undefined, candidate: GalleryItem): GalleryItem {
  if (existing === undefined) return candidate
  const merged: GalleryItem = { ...existing, ...candidate, createdAt: existing.createdAt > 0 ? existing.createdAt : candidate.createdAt }
  if (candidate.isFavorite === undefined && existing.isFavorite !== undefined) merged.isFavorite = existing.isFavorite
  if (candidate.tags === undefined && existing.tags !== undefined) merged.tags = existing.tags
  if (candidate.savedTo === undefined && existing.savedTo !== undefined) merged.savedTo = existing.savedTo
  if (candidate.saveError === undefined && existing.saveError !== undefined) merged.saveError = existing.saveError
  if (candidate.workspacePath === undefined && existing.workspacePath !== undefined) merged.workspacePath = existing.workspacePath
  if (candidate.workspaceId === undefined && existing.workspaceId !== undefined) merged.workspaceId = existing.workspaceId
  if (candidate.sessionId === undefined && existing.sessionId !== undefined) merged.sessionId = existing.sessionId
  return merged
}

function galleryItemsEqual(a: GalleryItem, b: GalleryItem): boolean {
  return a.id === b.id && attachmentsEqual(a.attachment, b.attachment) && a.prompt === b.prompt && a.engine === b.engine && a.model === b.model && a.createdAt === b.createdAt && a.aspectRatio === b.aspectRatio && a.imageSize === b.imageSize && a.output === b.output && a.isFavorite === b.isFavorite && JSON.stringify(a.tags ?? []) === JSON.stringify(b.tags ?? []) && a.workspacePath === b.workspacePath && a.workspaceId === b.workspaceId && a.sessionId === b.sessionId && a.savedTo === b.savedTo && a.saveError === b.saveError && a.normalizationError === b.normalizationError
}

function attachmentsEqual(a: ImageAttachmentRef, b: ImageAttachmentRef): boolean {
  return a.attachmentId === b.attachmentId && a.mediaType === b.mediaType && a.bytes === b.bytes && a.width === b.width && a.height === b.height && a.name === b.name && JSON.stringify(a.originalDimensions ?? null) === JSON.stringify(b.originalDimensions ?? null)
}

/** Validate a row before exposing it to gallery image components. */
function normalizePersistedGalleryItem(value: GalleryItemInput): GalleryItem | undefined {
  const normalized = normalizeGalleryItem(value)
  const attachment = imageAttachment(normalized.attachment)
  if (typeof normalized.id !== 'string' || normalized.id.trim() === '' || attachment === undefined || typeof normalized.prompt !== 'string') return undefined
  return { ...normalized, attachment, createdAt: typeof normalized.createdAt === 'number' && Number.isFinite(normalized.createdAt) ? normalized.createdAt : 0 }
}

/**
 * Retrieve all gallery records sorted by createdAt descending. Reading the
 * object store rather than only the index keeps legacy rows without a timestamp
 * visible; malformed rows are quarantined from the returned list.
 */
export async function getGalleryItems(): Promise<GalleryItem[]> {
  try {
    const db = await getDB()
    return await new Promise<GalleryItem[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const req = tx.objectStore(STORE_NAME).getAll()
      req.onsuccess = () => {
        const items = req.result.flatMap((value) => {
          try {
            const item = normalizePersistedGalleryItem(value as GalleryItemInput)
            return item === undefined ? [] : [item]
          } catch {
            return []
          }
        }).sort((a, b) => b.createdAt - a.createdAt)
        resolve(items)
      }
      req.onerror = () => reject(req.error)
    })
  } catch (err) {
    console.warn('[dsh-image-gen] Failed to read gallery items from IndexedDB:', err)
    return []
  }
}

/** Toggle the persisted favorite flag and return the new state. */
export async function toggleFavoriteGalleryItem(id: string): Promise<boolean | undefined> {
  try {
    const db = await getDB()
    return await new Promise<boolean | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      let changed = false
      let nextStatus = false
      const request = store.get(id)
      request.onsuccess = () => {
        const raw = request.result as GalleryItemInput | undefined
        if (raw === undefined) return
        const item = normalizePersistedGalleryItem(raw)
        if (item === undefined) return
        changed = true
        nextStatus = item.isFavorite !== true
        const put = store.put({ ...item, isFavorite: nextStatus })
        put.onerror = () => reject(put.error)
      }
      request.onerror = () => reject(request.error)
      tx.oncomplete = () => {
        if (changed) notifyListeners()
        resolve(changed ? nextStatus : undefined)
      }
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'))
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'))
    })
  } catch (err) {
    console.warn('[dsh-image-gen] Failed to toggle favorite item in IndexedDB:', err)
    return undefined
  }
}

/** Delete multiple gallery records and write tombstones in one transaction. */
export async function bulkDeleteGalleryItems(ids: readonly string[]): Promise<void> {
  const uniqueIds = [...new Set(ids.filter((id): id is string => typeof id === 'string' && id.trim() !== ''))]
  if (uniqueIds.length === 0) return
  const db = await getDB()
  const tombstones = await loadTombstones(db)
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([STORE_NAME, TOMBSTONE_STORE], 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const tombstoneStore = tx.objectStore(TOMBSTONE_STORE)
    const deletedAt = Date.now()
    for (const id of uniqueIds) {
      store.delete(id)
      tombstoneStore.put({ id, deletedAt })
    }
    tx.oncomplete = () => {
      for (const id of uniqueIds) tombstones.add(id)
      resolve()
    }
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'))
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'))
  })
  notifyListeners()
}

/** Delete a single gallery record by ID and record a tombstone. */
export async function deleteGalleryItem(id: string): Promise<boolean> {
  try {
    await bulkDeleteGalleryItems([id])
    return true
  } catch (err) {
    console.warn('[dsh-image-gen] Failed to delete gallery item from IndexedDB:', err)
    return false
  }
}

/** Clear all gallery records and reset tombstones after commit succeeds. */
export async function clearGallery(): Promise<void> {
  try {
    const db = await getDB()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([STORE_NAME, TOMBSTONE_STORE], 'readwrite')
      tx.objectStore(STORE_NAME).clear()
      tx.objectStore(TOMBSTONE_STORE).clear()
      tx.oncomplete = () => {
        tombstonesCache?.clear()
        resolve()
      }
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'))
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'))
    })
    notifyListeners()
  } catch (err) {
    console.warn('[dsh-image-gen] Failed to clear gallery in IndexedDB:', err)
  }
}

/** Normalize path separators and case for cross-platform workspace matching. */
export function normalizeWorkspacePath(rawPath: string): string {
  const normalized = rawPath.replace(/\\/g, '/').replace(/\/+$/, '')
  // POSIX paths are case-sensitive; drive/UNC spellings are Windows paths and
  // are compared case-insensitively for cross-version workspace metadata.
  return /^[A-Za-z]:\//u.test(normalized) || normalized.startsWith('//') ? normalized.toLowerCase() : normalized
}

/** Determine whether an item belongs to a workspace using stable metadata or its saved path. */
export function isItemInWorkspace(
  item: GalleryItem,
  workspace?: { workspaceId?: string; path?: string; sessionIds?: readonly string[] } | null,
): boolean {
  if (!workspace || (!workspace.workspaceId && !workspace.path && (!workspace.sessionIds || workspace.sessionIds.length === 0))) return true
  if (item.workspaceId && workspace.workspaceId && item.workspaceId === workspace.workspaceId) return true
  if (item.sessionId && workspace.sessionIds?.includes(item.sessionId)) return true
  if (item.workspacePath && workspace.path && normalizeWorkspacePath(item.workspacePath) === normalizeWorkspacePath(workspace.path)) return true
  if (item.savedTo && workspace.path) {
    const saved = normalizeWorkspacePath(item.savedTo)
    const root = normalizeWorkspacePath(workspace.path)
    if (saved === root || saved.startsWith(`${root}/`)) return true
  }
  return false
}
