/** Same-origin host routes for the provider-neutral Inspiration Library. */
import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  INSPIRATION_CACHE_CLEAR_ROUTE,
  INSPIRATION_CATALOG_ROUTE,
  INSPIRATION_IMAGE_ROUTE,
  INSPIRATION_ROUTE_PREFIX,
  INSPIRATION_REFRESH_ROUTE,
  MAX_INSPIRATION_CATALOG_BYTES,
  MAX_INSPIRATION_IMAGE_BYTES,
  builtinInspirationCatalog,
  builtinInspirationSvg,
  fetchInspirationCandidates,
  filterInspirationCases,
  getInspirationCase,
  inspirationCatalogSourceUrls,
  inspirationImageSourceUrls,
  isInspirationCaseId,
  parseInspirationCatalog,
  parseInspirationFilters,
  readResponseBytes,
  type InspirationCase,
  type InspirationCatalog,
  type InspirationDiskCache,
} from './inspiration.js'
import { InspirationDiskCache as DiskCache } from './inspiration.js'
import { INSPIRATION_CACHE_NAMESPACE } from './shared.js'

/** Prefix used when registering this handler with DSH's web server. */
export const INSPIRATION_ROUTE = INSPIRATION_ROUTE_PREFIX
export {
  INSPIRATION_CACHE_CLEAR_ROUTE,
  INSPIRATION_CATALOG_ROUTE,
  INSPIRATION_IMAGE_ROUTE,
  INSPIRATION_REFRESH_ROUTE,
  INSPIRATION_ROUTE_PREFIX,
}
export const INSPIRATION_ROUTES = {
  prefix: INSPIRATION_ROUTE_PREFIX,
  catalog: INSPIRATION_CATALOG_ROUTE,
  refresh: INSPIRATION_REFRESH_ROUTE,
  cacheClear: INSPIRATION_CACHE_CLEAR_ROUTE,
  image: INSPIRATION_IMAGE_ROUTE,
} as const

const MAX_REQUEST_BODY_BYTES = 4096
const CATALOG_CACHE_KEY = `${INSPIRATION_CACHE_NAMESPACE}:catalog`
const IMAGE_CACHE_KEY_PREFIX = `${INSPIRATION_CACHE_NAMESPACE}:image:`
const IMAGE_CACHE_MAX_AGE = 3600

interface RouteState {
  catalog: InspirationCatalog | undefined
}

export interface InspirationRouteDeps {
  /** Optional isolated cache, useful for tests and host lifecycle ownership. */
  cache?: InspirationDiskCache
  /** Injectable fetch implementation; production defaults to global fetch. */
  fetch?: typeof globalThis.fetch
  /** Injectable clock used for deterministic catalog metadata in tests. */
  now?: () => number
  /** Internal state hook used by `createInspirationRoute`; not needed by callers. */
  state?: RouteState
}

const defaultCache = new DiskCache()
const defaultState: RouteState = { catalog: undefined }
const customStates = new WeakMap<object, RouteState>()

/**
 * Handle every Inspiration route. Register the prefix with the host web server;
 * this function performs its own exact path dispatch and same-origin check.
 */
export async function serveInspirationRoute(
  req: IncomingMessage,
  res: ServerResponse,
  deps: InspirationRouteDeps = {},
): Promise<void> {
  if (!sameOrigin(req)) return jsonError(res, 403, 'origin-rejected')
  const pathname = requestPath(req)
  const state = deps.state ?? stateFor(deps)
  if (pathname === INSPIRATION_CATALOG_ROUTE) {
    return serveCatalog(req, res, deps, state, false)
  }
  if (pathname === INSPIRATION_REFRESH_ROUTE) {
    return serveCatalog(req, res, deps, state, true)
  }
  if (pathname === INSPIRATION_CACHE_CLEAR_ROUTE) {
    return serveCacheClear(req, res, deps, state)
  }
  if (pathname === INSPIRATION_IMAGE_ROUTE || pathname.startsWith(`${INSPIRATION_IMAGE_ROUTE}/`)) {
    return serveInspirationImage(req, res, deps)
  }
  return jsonError(res, 404, 'not-found')
}

/** Alias for hosts that name route handlers by resource. */
export const serveInspiration = serveInspirationRoute
export const inspirationRouteHandler = serveInspirationRoute

/** Return a DSH-compatible prefix registration object. */
export function inspirationRouteRegistration(deps: InspirationRouteDeps = {}) {
  return {
    kind: 'prefix' as const,
    path: INSPIRATION_ROUTE_PREFIX,
    handler: (req: IncomingMessage, res: ServerResponse) => serveInspirationRoute(req, res, deps),
  }
}

/** Build an isolated route handler with its own in-memory catalog state. */
export function createInspirationRoute(deps: InspirationRouteDeps = {}) {
  const state: RouteState = { catalog: undefined }
  return (req: IncomingMessage, res: ServerResponse): Promise<void> => serveInspirationRoute(req, res, { ...deps, state })
}

async function serveCatalog(
  req: IncomingMessage,
  res: ServerResponse,
  deps: InspirationRouteDeps,
  state: RouteState,
  forceRefresh: boolean,
): Promise<void> {
  if (forceRefresh && req.method !== 'POST') return jsonError(res, 405, 'method-not-allowed')
  if (!forceRefresh && req.method !== 'GET') return jsonError(res, 405, 'method-not-allowed')
  if (forceRefresh) {
    try {
      await readRequestBody(req)
    } catch {
      return jsonError(res, 413, 'request-too-large')
    }
  }

  let query: string
  try {
    query = new URL(req.url ?? '/', requestBase(req)).search
  } catch {
    return jsonError(res, 400, 'invalid-request')
  }
  const filters = parseInspirationFilters(query)
  if (filters === undefined) return jsonError(res, 400, 'invalid-filter')
  const deadlineController = new AbortController()
  const deadline = setTimeout(() => deadlineController.abort(), 15_000)
  const onClose = () => deadlineController.abort()
  req.once?.('close', onClose)
  let catalog: InspirationCatalog
  try {
    catalog = await loadCatalog(deps, state, forceRefresh, deadlineController.signal)
  } finally {
    clearTimeout(deadline)
    req.removeListener?.('close', onClose)
  }
  const filtered: InspirationCatalog = {
    ...catalog,
    cases: filterInspirationCases(catalog.cases, filters),
  }
  json(res, 200, filtered, forceRefresh ? 'no-store' : 'private, max-age=60')
}

async function loadCatalog(deps: InspirationRouteDeps, state: RouteState, forceRefresh: boolean, signal?: AbortSignal): Promise<InspirationCatalog> {
  const cache = deps.cache ?? defaultCache
  const now = deps.now ?? Date.now
  if (!forceRefresh && state.catalog !== undefined) return state.catalog
  if (!forceRefresh) {
    const cached = await cache.get(CATALOG_CACHE_KEY)
    const parsed = parseCatalogBytes(cached)
    if (parsed !== undefined) {
      state.catalog = parsed
      return parsed
    }
  }

  if (forceRefresh) {
    const remote = await fetchRemoteCatalog(deps.fetch, signal)
    if (remote !== undefined) {
      state.catalog = remote.catalog
      void cache.set(CATALOG_CACHE_KEY, new TextEncoder().encode(JSON.stringify(remote.catalog)))
      return remote.catalog
    }
    const stale = parseCatalogBytes(await cache.get(CATALOG_CACHE_KEY))
    if (stale !== undefined) {
      state.catalog = stale
      return stale
    }
  }

  const builtin = builtinInspirationCatalog(now())
  state.catalog = builtin
  // Keep the offline catalog warm in the disk cache as well. Cache errors are
  // swallowed by InspirationDiskCache and never change the HTTP response.
  void cache.set(CATALOG_CACHE_KEY, new TextEncoder().encode(JSON.stringify(builtin)))
  return builtin
}

interface RemoteCatalog {
  catalog: InspirationCatalog
}

async function fetchRemoteCatalog(
  fetchImpl: typeof globalThis.fetch | undefined,
  signal: AbortSignal | undefined,
): Promise<RemoteCatalog | undefined> {
  const implementation = fetchImpl ?? globalThis.fetch
  if (typeof implementation !== 'function') return undefined
  let lastError: unknown
  for (const url of inspirationCatalogSourceUrls()) {
    if (signal?.aborted) return undefined
    const requestController = new AbortController()
    const timeout = setTimeout(() => requestController.abort(), 15_000)
    const onAbort = () => requestController.abort()
    signal?.addEventListener('abort', onAbort, { once: true })
    try {
      const response = await implementation(url, {
        method: 'GET',
        redirect: 'error',
        headers: { accept: 'application/json' },
        signal: requestController.signal,
      })
      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined)
        lastError = new Error(`HTTP ${response.status}`)
        continue
      }
      const bytes = await readResponseBytes(response, MAX_INSPIRATION_CATALOG_BYTES)
      const parsed = parseCatalogBytes(bytes)
      if (parsed === undefined) {
        lastError = new Error('Invalid inspiration catalog')
        continue
      }
      const source = sourceKind(url)
      return {
        catalog: {
          ...parsed,
          source,
          updatedAt: parsed.updatedAt,
        },
      }
    } catch (error) {
      if (signal?.aborted) return undefined
      lastError = error
    } finally {
      clearTimeout(timeout)
      signal?.removeEventListener('abort', onAbort)
    }
  }
  void lastError
  return undefined
}

function sourceKind(url: string): InspirationCatalog['source'] {
  if (url.includes('cdn.jsdelivr.net')) return 'jsdelivr'
  if (url.includes('raw.githubusercontent.com')) return 'github'
  return 'mirror'
}

function parseCatalogBytes(bytes: Uint8Array | undefined): InspirationCatalog | undefined {
  if (bytes === undefined) return undefined
  try {
    return parseInspirationCatalog(JSON.parse(new TextDecoder().decode(bytes)))
  } catch {
    return undefined
  }
}

async function serveCacheClear(
  req: IncomingMessage,
  res: ServerResponse,
  deps: InspirationRouteDeps,
  state: RouteState,
): Promise<void> {
  if (req.method !== 'POST') return jsonError(res, 405, 'method-not-allowed')
  try {
    await readRequestBody(req)
  } catch {
    return jsonError(res, 413, 'request-too-large')
  }
  state.catalog = undefined
  await (deps.cache ?? defaultCache).clear()
  json(res, 200, { ok: true })
}

export async function serveInspirationImage(req: IncomingMessage, res: ServerResponse, deps: InspirationRouteDeps = {}): Promise<void> {
  if (!sameOrigin(req)) return jsonError(res, 403, 'origin-rejected')
  if (req.method !== 'GET' && req.method !== 'POST') return jsonError(res, 405, 'method-not-allowed')
  let caseId: string | undefined
  try {
    caseId = await imageCaseId(req)
  } catch {
    return jsonError(res, 400, 'invalid-request')
  }
  if (!isInspirationCaseId(caseId)) return jsonError(res, 400, 'invalid-case')
  const item = getInspirationCase(caseId)
  if (!item) return jsonError(res, 404, 'case-not-found')
  const cache = deps.cache ?? defaultCache
  const cacheKey = `${IMAGE_CACHE_KEY_PREFIX}${caseId}`
  const cached = await cache.get(cacheKey)
  if (cached !== undefined && cached.byteLength <= MAX_INSPIRATION_IMAGE_BYTES) {
    const cachedType = sniffImageContentType(cached)
    if (cachedType !== undefined) return imageResponse(res, cached, cachedType, true)
    void cache.delete(cacheKey)
  } else if (cached !== undefined) {
    void cache.delete(cacheKey)
  }

  const controller = new AbortController()
  let clientAborted = false
  let timedOut = false
  const timeout = setTimeout(() => { timedOut = true; controller.abort() }, 15_000)
  const onClose = () => { clientAborted = true; controller.abort() }
  req.once?.('close', onClose)
  let bytes: Uint8Array | undefined
  try {
    // The candidate URLs are generated from the fixed case allowlist. No value
    // from the browser request participates in this URL construction.
    const fetched = await fetchInspirationCandidates(inspirationImageSourceUrls(item), {
      maxBytes: MAX_INSPIRATION_IMAGE_BYTES,
      signal: controller.signal,
      ...(deps.fetch === undefined ? {} : { fetch: deps.fetch }),
    })
    const declaredType = safeImageContentType(fetched.response.headers.get('content-type'))
    bytes = fetched.data
    const detectedType = sniffImageContentType(bytes)
    if (detectedType === undefined || (declaredType !== undefined && declaredType !== detectedType)) throw new Error('invalid-image-content')
    void cache.set(cacheKey, bytes)
    return imageResponse(res, bytes, detectedType, false)
  } catch {
    if (clientAborted && !timedOut) return jsonError(res, 499, 'request-aborted')
    // Offline fallback is a tiny generated SVG, not an embedded binary asset.
    bytes = new TextEncoder().encode(builtinInspirationSvg(item))
    if (bytes.byteLength > MAX_INSPIRATION_IMAGE_BYTES) return jsonError(res, 502, 'image-unavailable')
    // Do not persist an offline placeholder: a later request should retry the
    // pinned sources automatically instead of serving stale SVG forever.
    return imageResponse(res, bytes, 'image/svg+xml', false, true)
  } finally {
    clearTimeout(timeout)
    req.removeListener?.('close', onClose)
  }
}

function imageResponse(res: ServerResponse, data: Uint8Array, contentType: string, fromCache: boolean, fallback = false): void {
  if (res.headersSent || res.writableEnded || res.destroyed) return
  res.writeHead(200, {
    'content-type': contentType,
    'content-length': String(data.byteLength),
    'cache-control': `public, max-age=${IMAGE_CACHE_MAX_AGE}, must-revalidate`,
    'x-content-type-options': 'nosniff',
    ...(fromCache ? { 'x-dsh-cache': 'disk' } : {}),
    ...(fallback ? { 'x-dsh-inspiration-fallback': '1' } : {}),
  })
  res.end(data)
}

function sniffImageContentType(data: Uint8Array): InspirationCase['imageMediaType'] | undefined {
  if (data.length >= 8 && data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47) return 'image/png'
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'image/jpeg'
  if (data.length >= 6 && data[0] === 0x47 && data[1] === 0x49 && data[2] === 0x46) return 'image/gif'
  if (data.length >= 12 && data[0] === 0x52 && data[1] === 0x49 && data[2] === 0x46 && data[3] === 0x46 && data[8] === 0x57 && data[9] === 0x45 && data[10] === 0x42 && data[11] === 0x50) return 'image/webp'
  const prefix = new TextDecoder().decode(data.subarray(0, 256)).trimStart().toLowerCase()
  return prefix.startsWith('<svg') || prefix.startsWith('<?xml') ? 'image/svg+xml' : undefined
}

function safeImageContentType(value: string | null): InspirationCase['imageMediaType'] | undefined {
  const normalized = value?.split(';', 1)[0]?.trim().toLowerCase()
  if (normalized === 'image/svg+xml' || normalized === 'image/webp' || normalized === 'image/png' || normalized === 'image/jpeg' || normalized === 'image/gif') return normalized
  return undefined
}

async function imageCaseId(req: IncomingMessage): Promise<string | undefined> {
  const parsed = new URL(req.url ?? '/', requestBase(req))
  const pathPrefix = `${INSPIRATION_IMAGE_ROUTE}/`
  let pathId: string | undefined
  if (parsed.pathname.startsWith(pathPrefix)) {
    const remainder = parsed.pathname.slice(pathPrefix.length)
    if (remainder !== '' && !remainder.includes('/')) {
      try {
        pathId = decodeURIComponent(remainder)
      } catch {
        return undefined
      }
    }
  }
  const queryId = parsed.searchParams.get('caseId') ?? parsed.searchParams.get('id')
  if (parsed.searchParams.has('url') || parsed.searchParams.has('sourceUrl')) return undefined
  if (req.method === 'GET') return pathId ?? queryId ?? undefined
  let body: unknown
  let raw = ''
  try {
    raw = await readRequestBody(req)
    body = raw === '' ? undefined : JSON.parse(raw)
  } catch {
    return undefined
  }
  if (raw === '') return pathId ?? queryId ?? undefined
  const root = objectRecord(body)
  if (!root || Object.keys(root).some((key) => !['caseId', 'id'].includes(key))) return undefined
  const bodyId = root.caseId ?? root.id
  if (pathId !== undefined && bodyId !== undefined && bodyId !== pathId) return undefined
  return pathId ?? queryId ?? (typeof bodyId === 'string' ? bodyId : undefined)
}

async function readRequestBody(req: IncomingMessage): Promise<string> {
  if (typeof (req as unknown as { [Symbol.asyncIterator]?: unknown })[Symbol.asyncIterator] !== 'function') return ''
  const chunks: Buffer[] = []
  let bytes = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    bytes += buffer.byteLength
    if (bytes > MAX_REQUEST_BODY_BYTES) throw new Error('request-too-large')
    chunks.push(buffer)
  }
  return Buffer.concat(chunks).toString('utf8')
}

function objectRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

function sameOrigin(req: IncomingMessage): boolean {
  const origin = req.headers.origin
  const host = req.headers.host
  if (origin === undefined) return true
  if (host === undefined) return false
  return origin === `http://${host}` || origin === `https://${host}`
}

function requestBase(req: IncomingMessage): string {
  const host = req.headers.host ?? 'localhost'
  return `http://${host}`
}

function requestPath(req: IncomingMessage): string {
  try {
    return new URL(req.url ?? '/', requestBase(req)).pathname
  } catch {
    return ''
  }
}

function json(res: ServerResponse, status: number, value: unknown, cacheControl = 'no-store'): void {
  if (res.headersSent || res.writableEnded || res.destroyed) return
  const body = JSON.stringify(value)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': String(Buffer.byteLength(body)),
    'cache-control': cacheControl,
    'x-content-type-options': 'nosniff',
  })
  res.end(body)
}

function jsonError(res: ServerResponse, status: number, code: string): void {
  json(res, status, { error: code })
}

function stateFor(deps: InspirationRouteDeps): RouteState {
  if (Object.keys(deps).length === 0) return defaultState
  const key = deps as object
  const existing = customStates.get(key)
  if (existing !== undefined) return existing
  const state: RouteState = { catalog: undefined }
  customStates.set(key, state)
  return state
}
