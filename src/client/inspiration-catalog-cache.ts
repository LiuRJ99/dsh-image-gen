/** Small, failure-tolerant IndexedDB cache for the Inspiration catalog. */
import type { InspirationCatalog } from '../inspiration.js'
import { INSPIRATION_CACHE_NAMESPACE } from '../shared.js'
import {
  INSPIRATION_KNOWN_CATEGORIES,
  INSPIRATION_KNOWN_CASE_IDS,
  INSPIRATION_KNOWN_SCENES,
  INSPIRATION_KNOWN_STYLES,
} from './inspiration-known-data.js'

/** Catalog metadata is intentionally capped well below browser quota limits. */
export const MAX_INSPIRATION_CATALOG_CACHE_BYTES = 4 * 1024 * 1024
export const DEFAULT_INSPIRATION_CATALOG_CACHE_MAX_BYTES = MAX_INSPIRATION_CATALOG_CACHE_BYTES
export const INSPIRATION_CATALOG_CACHE_DB = `dsh_image_gen_inspiration_${INSPIRATION_CACHE_NAMESPACE}`
export const INSPIRATION_CATALOG_CACHE_STORE = 'catalog'
/** Same-origin route constants are duplicated here to keep the browser bundle free of node imports. */
export const INSPIRATION_CATALOG_ROUTE = '/plugins/dsh-image-gen/inspiration/catalog'
export const INSPIRATION_REFRESH_ROUTE = '/plugins/dsh-image-gen/inspiration/refresh'
const CATALOG_KEY = `${INSPIRATION_CACHE_NAMESPACE}:catalog`

interface CatalogCacheRecord {
  id: string
  catalog: InspirationCatalog
  bytes: number
  savedAt: number
}

export interface InspirationCatalogCacheOptions {
  dbName?: string
  storeName?: string
  maxBytes?: number
  now?: () => number
}

const dbs = new Map<string, Promise<IDBDatabase>>()

/**
 * Persist one validated catalog. All browser storage errors are swallowed so a
 * private-mode/quota failure never prevents gallery UI from using the network.
 */
export class InspirationCatalogCache {
  readonly dbName: string
  readonly storeName: string
  readonly maxBytes: number
  private readonly now: () => number
  private mutationQueue: Promise<void> = Promise.resolve()

  constructor(options: InspirationCatalogCacheOptions = {}) {
    this.dbName = options.dbName ?? INSPIRATION_CATALOG_CACHE_DB
    this.storeName = options.storeName ?? INSPIRATION_CATALOG_CACHE_STORE
    this.maxBytes = Number.isFinite(options.maxBytes) && (options.maxBytes ?? 0) > 0
      ? Math.floor(options.maxBytes as number)
      : MAX_INSPIRATION_CATALOG_CACHE_BYTES
    this.now = options.now ?? Date.now
  }

  async get(): Promise<InspirationCatalog | undefined> {
    return this.safe(async () => {
      const db = await openDatabase(this.dbName, this.storeName)
      const value = await requestResult<unknown>(db.transaction(this.storeName, 'readonly').objectStore(this.storeName).get(CATALOG_KEY))
      const record = asRecord(value)
      const cachedBytes = typeof record?.bytes === 'number' ? record.bytes : undefined
      if (!record || record.id !== CATALOG_KEY || cachedBytes === undefined || !Number.isSafeInteger(cachedBytes) || cachedBytes < 0 || cachedBytes > this.maxBytes || !validCatalog(record.catalog)) return undefined
      const encoded = encodedBytes(JSON.stringify(record.catalog))
      if (encoded !== cachedBytes || encoded > this.maxBytes) return undefined
      return cloneCatalog(record.catalog)
    }, undefined)
  }

  async put(catalog: InspirationCatalog): Promise<boolean> {
    return this.enqueueMutation(() => this.safe(async () => {
      const normalized = validCatalog(catalog) ? cloneCatalog(catalog) : undefined
      if (!normalized) return false
      const bytes = encodedBytes(JSON.stringify(normalized))
      if (bytes > this.maxBytes) return false
      const db = await openDatabase(this.dbName, this.storeName)
      const tx = db.transaction(this.storeName, 'readwrite')
      tx.objectStore(this.storeName).put({ id: CATALOG_KEY, catalog: normalized, bytes, savedAt: this.now() } satisfies CatalogCacheRecord)
      await transactionDone(tx)
      return true
    }, false))
  }

  async clear(): Promise<void> {
    await this.enqueueMutation(() => this.safe(async () => {
      const db = await openDatabase(this.dbName, this.storeName)
      const tx = db.transaction(this.storeName, 'readwrite')
      tx.objectStore(this.storeName).clear()
      await transactionDone(tx)
    }, undefined))
  }

  /** Alias useful to cache-owning clients. */
  delete(): Promise<void> { return this.clear() }

  private async safe<T>(operation: () => Promise<T>, fallback: T): Promise<T> {
    try {
      return await operation()
    } catch {
      return fallback
    }
  }

  private enqueueMutation<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.mutationQueue.then(operation, operation)
    this.mutationQueue = next.then(() => undefined, () => undefined)
    return next
  }
}

let defaultCache: InspirationCatalogCache | undefined

export function getInspirationCatalogCache(options?: InspirationCatalogCacheOptions): InspirationCatalogCache {
  if (options !== undefined) return new InspirationCatalogCache(options)
  defaultCache ??= new InspirationCatalogCache()
  return defaultCache
}

export async function getCachedInspirationCatalog(): Promise<InspirationCatalog | undefined> {
  return getInspirationCatalogCache().get()
}

export async function cacheInspirationCatalog(catalog: InspirationCatalog): Promise<boolean> {
  return getInspirationCatalogCache().put(catalog)
}

export async function clearInspirationCatalogCache(): Promise<void> {
  await getInspirationCatalogCache().clear()
}

export interface FetchInspirationCatalogOptions {
  cache?: InspirationCatalogCache
  fetch?: typeof globalThis.fetch
  signal?: AbortSignal
  forceRefresh?: boolean
  query?: string
}

/**
 * Cache-first browser loader for the same-origin catalog route. A failed
 * refresh falls back to the last valid IndexedDB value, then returns undefined.
 */
export async function fetchInspirationCatalog(options: FetchInspirationCatalogOptions = {}): Promise<InspirationCatalog | undefined> {
  const cache = options.cache ?? getInspirationCatalogCache()
  if (!options.forceRefresh && options.query === undefined) {
    const cached = await cache.get()
    if (cached !== undefined) return cached
  }
  const fetchImpl = options.fetch ?? globalThis.fetch
  if (typeof fetchImpl !== 'function') return cache.get()
  const baseRoute = options.forceRefresh ? INSPIRATION_REFRESH_ROUTE : INSPIRATION_CATALOG_ROUTE
  const route = options.query === undefined ? baseRoute : `${baseRoute}?${options.query.replace(/^\?/, '')}`
  try {
    const response = await fetchImpl(route, {
      method: options.forceRefresh ? 'POST' : 'GET',
      headers: { accept: 'application/json' },
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    })
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined)
      return cache.get()
    }
    const bytes = await readBoundedCatalogBytes(response, MAX_INSPIRATION_CATALOG_CACHE_BYTES)
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as unknown
    if (!validCatalog(parsed)) return cache.get()
    const catalog = cloneCatalog(parsed)
    if (options.query === undefined) await cache.put(catalog)
    return catalog
  } catch {
    return cache.get()
  }
}

export async function readBoundedCatalogBytes(response: Response, maxBytes = MAX_INSPIRATION_CATALOG_CACHE_BYTES): Promise<Uint8Array> {
  const advertised = Number(response.headers.get('content-length'))
  if (Number.isFinite(advertised) && advertised > maxBytes) {
    await response.body?.cancel().catch(() => undefined)
    throw new Error('catalog-too-large')
  }
  if (!response.body) {
    const data = new Uint8Array(await response.arrayBuffer())
    if (data.byteLength > maxBytes) throw new Error('catalog-too-large')
    return data
  }
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const next = await reader.read()
      if (next.done) break
      total += next.value.byteLength
      if (total > maxBytes) throw new Error('catalog-too-large')
      chunks.push(next.value)
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined)
    throw error
  } finally {
    reader.releaseLock()
  }
  const result = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.byteLength
  }
  return result
}

export async function refreshInspirationCatalog(options: Omit<FetchInspirationCatalogOptions, 'forceRefresh'> = {}): Promise<InspirationCatalog | undefined> {
  return fetchInspirationCatalog({ ...options, forceRefresh: true })
}

export const loadInspirationCatalog = fetchInspirationCatalog

/** Reset in-memory connection state; primarily useful after a test closes IDB. */
export function resetInspirationCatalogCacheForTests(): void {
  defaultCache = undefined
  dbs.clear()
}

function openDatabase(dbName: string, storeName: string): Promise<IDBDatabase> {
  const key = `${dbName}\u0000${storeName}`
  const existing = dbs.get(key)
  if (existing) return existing
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('IndexedDB is unavailable'))
  let request: IDBOpenDBRequest
  try {
    request = indexedDB.open(dbName, 1)
  } catch (error) {
    return Promise.reject(error)
  }
  const promise = new Promise<IDBDatabase>((resolve, reject) => {
    const reset = () => {
      if (dbs.get(key) === promise) dbs.delete(key)
    }
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(storeName)) db.createObjectStore(storeName, { keyPath: 'id' })
    }
    request.onsuccess = () => {
      const db = request.result
      db.onversionchange = () => { db.close(); reset() }
      resolve(db)
    }
    request.onerror = () => { reset(); reject(request.error ?? new Error('IndexedDB open failed')) }
    request.onblocked = () => { reset(); reject(new Error('IndexedDB open blocked by another tab')) }
  })
  dbs.set(key, promise)
  return promise
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'))
  })
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed'))
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted'))
  })
}

function encodedBytes(value: string): number {
  return new TextEncoder().encode(value).byteLength
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

const KNOWN_CASE_IDS: ReadonlySet<string> = new Set<string>(INSPIRATION_KNOWN_CASE_IDS)
const KNOWN_CATEGORIES: ReadonlySet<string> = new Set<string>(INSPIRATION_KNOWN_CATEGORIES)
const KNOWN_STYLES: ReadonlySet<string> = new Set<string>(INSPIRATION_KNOWN_STYLES)
/** Keep this explicit: it is the fork's client-side scene allowlist. */
const KNOWN_SCENES: ReadonlySet<string> = new Set<string>(INSPIRATION_KNOWN_SCENES)
const KNOWN_SOURCES: ReadonlySet<string> = new Set(['builtin', 'mirror', 'jsdelivr', 'github'])
const SAFE_CASE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u
const SAFE_IMAGE_PATH = /^images\/(?:[A-Za-z0-9][A-Za-z0-9._-]*\/)*[A-Za-z0-9][A-Za-z0-9._-]*\.(?:svg|webp|png|jpe?g|gif)$/u

function validDimensionList(value: unknown, known: ReadonlySet<string>, max: number): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.length <= max && value.every((entry) => typeof entry === 'string' && known.has(entry))
}

/** Defensive browser-side validation prevents poisoned cache records. */
function validCatalog(value: unknown): value is InspirationCatalog {
  const root = asRecord(value)
  if (!root || root.version !== 1 || !Array.isArray(root.cases) || root.cases.length === 0 || root.cases.length > 2_000) return false
  if (!validDimensionList(root.categories, KNOWN_CATEGORIES, 64)) return false
  if (!validDimensionList(root.styles, KNOWN_STYLES, 64)) return false
  if (!validDimensionList(root.scenes, KNOWN_SCENES, 64)) return false
  if (typeof root.sourceId !== 'string' || root.sourceId.length === 0 || root.sourceId.length > 120 || typeof root.repository !== 'string' || root.repository.length > 2048 || typeof root.sourceVersion !== 'string' || root.sourceVersion.length > 128) return false
  if (typeof root.totalCases !== 'number' || !Number.isSafeInteger(root.totalCases) || root.totalCases < root.cases.length) return false
  const ids = new Set<string>()
  for (const raw of root.cases) {
    const item = asRecord(raw)
    if (!item || typeof item.id !== 'string' || !SAFE_CASE_ID.test(item.id) || !KNOWN_CASE_IDS.has(item.id) || ids.has(item.id)) return false
    if (typeof item.upstreamId !== 'number' || !Number.isSafeInteger(item.upstreamId) || item.upstreamId <= 0) return false
    if (typeof item.title !== 'string' || item.title.length > 256 || typeof item.description !== 'string' || item.description.length > 2_000 || typeof item.imageAlt !== 'string' || item.imageAlt.length > 512 || typeof item.promptPreview !== 'string' || item.promptPreview.length > 1_000 || typeof item.prompt !== 'string' || item.prompt.length > 16_000) return false
    if (typeof item.category !== 'string' || !KNOWN_CATEGORIES.has(item.category)) return false
    if (!validDimensionList(item.styles, KNOWN_STYLES, 64) || !validDimensionList(item.scenes, KNOWN_SCENES, 64)) return false
    if (typeof item.style !== 'string' || !KNOWN_STYLES.has(item.style) || typeof item.scene !== 'string' || !KNOWN_SCENES.has(item.scene)) return false
    if (typeof item.imagePath !== 'string' || item.imagePath.length > 256 || !SAFE_IMAGE_PATH.test(item.imagePath)) return false
    if (item.imageMediaType !== 'image/svg+xml' && item.imageMediaType !== 'image/webp' && item.imageMediaType !== 'image/png' && item.imageMediaType !== 'image/jpeg' && item.imageMediaType !== 'image/gif') return false
    if (item.source !== undefined && (typeof item.source !== 'string' || !KNOWN_SOURCES.has(item.source))) return false
    for (const key of ['sourceLabel', 'attributionUrl', 'githubUrl', 'sourceUrl'] as const) {
      if (item[key] !== undefined && (typeof item[key] !== 'string' || item[key].length > 2048)) return false
    }
    ids.add(item.id)
  }
  return typeof root.updatedAt === 'number' && Number.isFinite(root.updatedAt)
}

function cloneCatalog(catalog: InspirationCatalog): InspirationCatalog {
  return JSON.parse(JSON.stringify(catalog)) as InspirationCatalog
}
