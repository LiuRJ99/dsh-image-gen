/** Bounded, failure-tolerant IndexedDB cache for Inspiration images. */
import { INSPIRATION_CACHE_NAMESPACE } from '../shared.js'
import { INSPIRATION_KNOWN_CASE_IDS } from './inspiration-known-data.js'

/** Browser image bytes are capped independently of the catalog metadata. */
export const MAX_INSPIRATION_IMAGE_CACHE_BYTES = 8 * 1024 * 1024
export const DEFAULT_INSPIRATION_IMAGE_CACHE_MAX_BYTES = MAX_INSPIRATION_IMAGE_CACHE_BYTES
export const INSPIRATION_IMAGE_CACHE_DB = `dsh_image_gen_inspiration_images_${INSPIRATION_CACHE_NAMESPACE}`
export const INSPIRATION_IMAGE_CACHE_STORE = 'images'
/** Same-origin image route; keep this module browser-safe (no node imports). */
export const INSPIRATION_IMAGE_ROUTE = '/plugins/dsh-image-gen/inspiration/image'

interface ImageCacheRecord {
  id: string
  blob: Blob
  bytes: number
  mediaType: string
  savedAt: number
  lastAccessedAt: number
}

export interface InspirationImageCacheEntry {
  id: string
  blob: Blob
  bytes: number
  mediaType: string
  savedAt: number
  lastAccessedAt: number
}

export interface InspirationImageCacheOptions {
  dbName?: string
  storeName?: string
  maxBytes?: number
  now?: () => number
}

const dbs = new Map<string, Promise<IDBDatabase>>()

/**
 * Store image blobs under case ids only. Arbitrary URL keys are rejected before
 * they can affect IndexedDB, and all storage/quota errors are swallowed.
 */
export class InspirationImageCache {
  readonly dbName: string
  readonly storeName: string
  readonly maxBytes: number
  private readonly now: () => number
  private mutationQueue: Promise<void> = Promise.resolve()

  constructor(options: InspirationImageCacheOptions = {}) {
    this.dbName = options.dbName ?? INSPIRATION_IMAGE_CACHE_DB
    this.storeName = options.storeName ?? INSPIRATION_IMAGE_CACHE_STORE
    this.maxBytes = Number.isFinite(options.maxBytes) && (options.maxBytes ?? 0) > 0
      ? Math.floor(options.maxBytes as number)
      : MAX_INSPIRATION_IMAGE_CACHE_BYTES
    this.now = options.now ?? Date.now
  }

  async get(id: string): Promise<Blob | undefined> {
    const entry = await this.getEntry(id)
    return entry?.blob
  }

  async getEntry(id: string): Promise<InspirationImageCacheEntry | undefined> {
    if (!isSafeImageKey(id)) return undefined
    try {
      const db = await openDatabase(this.dbName, this.storeName)
      const tx = db.transaction(this.storeName, 'readonly')
      const value = await requestResult<unknown>(tx.objectStore(this.storeName).get(id))
      const record = asRecord(value)
      if (!validRecord(record, id, this.maxBytes)) return undefined
      const entry = record as unknown as InspirationImageCacheEntry
      // Updating recency is best effort and deliberately detached from reads.
      void this.touch(id)
      return { ...entry }
    } catch {
      return undefined
    }
  }

  async put(id: string, image: Blob | Uint8Array, mediaType = typeof Blob !== 'undefined' && image instanceof Blob ? image.type : 'image/webp'): Promise<boolean> {
    if (!isSafeImageKey(id) || typeof Blob === 'undefined') return false
    return this.enqueueMutation(async () => {
      try {
        const blob = image instanceof Blob ? image : new Blob([image as BlobPart], { type: mediaType })
        const bytes = blob.size
        if (bytes > this.maxBytes) return false
        const db = await openDatabase(this.dbName, this.storeName)
        const oldRecords = await readAll(db, this.storeName)
        const now = this.now()
        const next: ImageCacheRecord = {
          id,
          blob,
          bytes,
          mediaType: mediaType || blob.type || 'application/octet-stream',
          savedAt: now,
          lastAccessedAt: now,
        }
        const records = oldRecords.filter((record) => record.id !== id)
        records.push(next)
        records.sort((a, b) => a.lastAccessedAt - b.lastAccessedAt)
        let total = records.reduce((sum, record) => sum + record.bytes, 0)
        const evicted = new Set<string>()
        for (const record of records) {
          if (total <= this.maxBytes) break
          total -= record.bytes
          evicted.add(record.id)
        }
        if (evicted.has(id)) return false

        const tx = db.transaction(this.storeName, 'readwrite')
        const store = tx.objectStore(this.storeName)
        for (const record of oldRecords) {
          if (record.id === id || evicted.has(record.id)) store.delete(record.id)
        }
        store.put(next)
        await transactionDone(tx)
        return true
      } catch {
        return false
      }
    })
  }

  async delete(id: string): Promise<void> {
    if (!isSafeImageKey(id)) return
    await this.enqueueMutation(async () => {
      try {
        const db = await openDatabase(this.dbName, this.storeName)
        const tx = db.transaction(this.storeName, 'readwrite')
        tx.objectStore(this.storeName).delete(id)
        await transactionDone(tx)
      } catch {
        /* ignored */
      }
    })
  }

  async clear(): Promise<void> {
    await this.enqueueMutation(async () => {
      try {
        const db = await openDatabase(this.dbName, this.storeName)
        const tx = db.transaction(this.storeName, 'readwrite')
        tx.objectStore(this.storeName).clear()
        await transactionDone(tx)
      } catch {
        /* ignored */
      }
    })
  }

  /** Return the currently persisted byte count, or zero when IDB is absent. */
  async sizeBytes(): Promise<number> {
    try {
      const db = await openDatabase(this.dbName, this.storeName)
      const records = await readAll(db, this.storeName)
      return records.reduce((sum, record) => sum + record.bytes, 0)
    } catch {
      return 0
    }
  }

  private async touch(id: string): Promise<void> {
    await this.enqueueMutation(async () => {
      try {
        const db = await openDatabase(this.dbName, this.storeName)
        const tx = db.transaction(this.storeName, 'readwrite')
        const store = tx.objectStore(this.storeName)
        const request = store.get(id)
        request.onsuccess = () => {
          const record = asRecord(request.result)
          if (record && record.id === id) {
            store.put({ ...record, lastAccessedAt: this.now() })
          }
        }
        await transactionDone(tx)
      } catch {
        /* A stale recency update must never fail an image read. */
      }
    })
  }

  private enqueueMutation<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.mutationQueue.then(operation, operation)
    this.mutationQueue = next.then(() => undefined, () => undefined)
    return next
  }
}

let defaultCache: InspirationImageCache | undefined

export function getInspirationImageCache(options?: InspirationImageCacheOptions): InspirationImageCache {
  if (options !== undefined) return new InspirationImageCache(options)
  defaultCache ??= new InspirationImageCache()
  return defaultCache
}

export async function getCachedInspirationImage(id: string): Promise<Blob | undefined> {
  return getInspirationImageCache().get(id)
}

export async function cacheInspirationImage(id: string, image: Blob | Uint8Array, mediaType?: string): Promise<boolean> {
  return getInspirationImageCache().put(id, image, mediaType)
}

export async function clearInspirationImageCache(): Promise<void> {
  await getInspirationImageCache().clear()
}

/** Read an image response without buffering beyond the shared cache limit. */
export async function readBoundedImageBlob(response: Response, maxBytes = MAX_INSPIRATION_IMAGE_CACHE_BYTES): Promise<Blob> {
  const advertised = Number(response.headers.get('content-length'))
  if (Number.isFinite(advertised) && advertised > maxBytes) {
    await response.body?.cancel().catch(() => undefined)
    throw new Error('image-too-large')
  }
  if (!response.body) {
    const blob = await response.blob()
    if (blob.size > maxBytes) throw new Error('image-too-large')
    return blob
  }
  const reader = response.body.getReader()
  const chunks: BlobPart[] = []
  let total = 0
  try {
    while (true) {
      const next = await reader.read()
      if (next.done) break
      total += next.value.byteLength
      if (total > maxBytes) throw new Error('image-too-large')
      chunks.push(next.value as unknown as BlobPart)
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined)
    throw error
  } finally {
    reader.releaseLock()
  }
  return new Blob(chunks, { type: response.headers.get('content-type') ?? 'image/webp' })
}

export interface FetchInspirationImageOptions {
  cache?: InspirationImageCache
  fetch?: typeof globalThis.fetch
  signal?: AbortSignal
  forceRefresh?: boolean
}

/**
 * Cache-first browser image loader. It accepts a case id only and constructs a
 * same-origin URL; callers cannot redirect it to a user-supplied image host.
 */
export async function fetchInspirationImage(id: string, options: FetchInspirationImageOptions = {}): Promise<Blob | undefined> {
  if (!isSafeImageKey(id)) return undefined
  const cache = options.cache ?? getInspirationImageCache()
  if (!options.forceRefresh) {
    const cached = await cache.get(id)
    if (cached !== undefined) return cached
  }
  const fetchImpl = options.fetch ?? globalThis.fetch
  if (typeof fetchImpl !== 'function') return cache.get(id)
  try {
    const response = await fetchImpl(`${INSPIRATION_IMAGE_ROUTE}/${encodeURIComponent(id)}`, {
      method: 'GET',
      headers: { accept: 'image/*' },
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    })
    if (!response.ok) return cache.get(id)
    const advertised = Number(response.headers.get('content-length'))
    if (Number.isFinite(advertised) && advertised > MAX_INSPIRATION_IMAGE_CACHE_BYTES) return cache.get(id)
    const blob = await readBoundedImageBlob(response)
    if (response.headers.get('x-dsh-inspiration-fallback') !== '1') await cache.put(id, blob, blob.type || 'image/webp')
    return blob
  } catch {
    return cache.get(id)
  }
}

export const loadInspirationImage = fetchInspirationImage

export function resetInspirationImageCacheForTests(): void {
  defaultCache = undefined
  dbs.clear()
}

function isSafeImageKey(value: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(value) && KNOWN_CASE_IDS.has(value)
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

async function readAll(db: IDBDatabase, storeName: string): Promise<ImageCacheRecord[]> {
  const tx = db.transaction(storeName, 'readonly')
  const values = await requestResult<unknown[]>(tx.objectStore(storeName).getAll())
  return values.map(asRecord)
    .filter((value): value is Record<string, unknown> => value !== undefined && typeof value.id === 'string')
    .filter((value) => validRecord(value, value.id as string, Number.MAX_SAFE_INTEGER)) as unknown as ImageCacheRecord[]
}

function validRecord(value: Record<string, unknown> | undefined, expectedId: string, maxBytes: number): value is Record<string, unknown> {
  if (!value || value.id !== expectedId || !isSafeImageKey(value.id)) return false
  if (!(typeof Blob !== 'undefined' && value.blob instanceof Blob)) return false
  if (typeof value.bytes !== 'number' || !Number.isFinite(value.bytes) || value.bytes < 0 || value.bytes !== value.blob.size || value.bytes > maxBytes) return false
  if (typeof value.mediaType !== 'string' || typeof value.savedAt !== 'number' || typeof value.lastAccessedAt !== 'number') return false
  return true
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

const KNOWN_CASE_IDS: ReadonlySet<string> = new Set<string>(INSPIRATION_KNOWN_CASE_IDS)
