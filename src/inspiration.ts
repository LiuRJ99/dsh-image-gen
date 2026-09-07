/**
 * Provider-neutral Inspiration Library primitives.
 *
 * The host owns the catalog/image fetches and this module deliberately keeps
 * the remote surface closed: only the small built-in case allowlist and the
 * three fixed repository origins below can ever be addressed. Browser callers
 * pass case ids, never URLs.
 */
import { createHash } from 'node:crypto'
import { lstat, mkdir, readdir, readFile, rename, rm, stat, utimes, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { INSPIRATION_SOURCE_REF } from './shared.js'

/** Same-origin route prefix used by the host and browser faces. */
export const INSPIRATION_ROUTE_PREFIX = '/plugins/dsh-image-gen/inspiration'
export const INSPIRATION_CATALOG_ROUTE = `${INSPIRATION_ROUTE_PREFIX}/catalog`
export const INSPIRATION_REFRESH_ROUTE = `${INSPIRATION_ROUTE_PREFIX}/refresh`
export const INSPIRATION_CACHE_CLEAR_ROUTE = `${INSPIRATION_ROUTE_PREFIX}/cache-clear`
export const INSPIRATION_IMAGE_ROUTE = `${INSPIRATION_ROUTE_PREFIX}/image`

/** Fixed allowlists. These are intentionally small and provider independent. */
export const INSPIRATION_CATEGORIES = [
  'portrait',
  'landscape',
  'product',
  'architecture',
  'nature',
  'illustration',
] as const
export const INSPIRATION_CATEGORY_ALLOWLIST = INSPIRATION_CATEGORIES
export const INSPIRATION_STYLES = [
  'photorealistic',
  'cinematic',
  'editorial',
  'minimal',
  'watercolor',
  'anime',
] as const
export const INSPIRATION_STYLE_ALLOWLIST = INSPIRATION_STYLES
export const INSPIRATION_SCENES = [
  'studio',
  'urban',
  'coastal',
  'interior',
  'forest',
  'fantasy',
] as const
export const INSPIRATION_SCENE_ALLOWLIST = INSPIRATION_SCENES

export type InspirationCategory = typeof INSPIRATION_CATEGORIES[number]
export type InspirationStyle = typeof INSPIRATION_STYLES[number]
export type InspirationScene = typeof INSPIRATION_SCENES[number]

/** Fixed remote repository used for optional catalog/image refreshes. */
export const INSPIRATION_REPOSITORY = {
  owner: 'LiuRJ99',
  name: 'dsh-image-gen',
  // Immutable release pin; update deliberately with a release rather than a
  // mutable branch so remote refresh cannot silently change prompts/assets.
  ref: INSPIRATION_SOURCE_REF,
  directory: 'inspiration',
} as const

/** Only these hosts and path prefixes are ever fetched by the host. */
export const INSPIRATION_SOURCE_URLS = {
  mirror: `https://cdn.statically.io/gh/${INSPIRATION_REPOSITORY.owner}/${INSPIRATION_REPOSITORY.name}/${INSPIRATION_REPOSITORY.ref}/${INSPIRATION_REPOSITORY.directory}`,
  jsdelivr: `https://cdn.jsdelivr.net/gh/${INSPIRATION_REPOSITORY.owner}/${INSPIRATION_REPOSITORY.name}@${INSPIRATION_REPOSITORY.ref}/${INSPIRATION_REPOSITORY.directory}`,
  github: `https://raw.githubusercontent.com/${INSPIRATION_REPOSITORY.owner}/${INSPIRATION_REPOSITORY.name}/${INSPIRATION_REPOSITORY.ref}/${INSPIRATION_REPOSITORY.directory}`,
} as const
export const INSPIRATION_SOURCE_ALLOWLIST = [
  INSPIRATION_SOURCE_URLS.mirror,
  INSPIRATION_SOURCE_URLS.jsdelivr,
  INSPIRATION_SOURCE_URLS.github,
] as const
export const INSPIRATION_SOURCE_IDS = ['mirror', 'jsdelivr', 'github'] as const
export type InspirationRemoteSource = typeof INSPIRATION_SOURCE_IDS[number]
export type InspirationSource = 'builtin' | InspirationRemoteSource

/** Limits used by the host fetcher and disk cache. */
export const MAX_INSPIRATION_CATALOG_BYTES = 512 * 1024
export const MAX_INSPIRATION_IMAGE_BYTES = 8 * 1024 * 1024
export const MAX_INSPIRATION_DISK_CACHE_BYTES = 32 * 1024 * 1024
/** Compatibility aliases for callers that prefer a `DEFAULT_*` spelling. */
export const DEFAULT_INSPIRATION_CATALOG_MAX_BYTES = MAX_INSPIRATION_CATALOG_BYTES
export const DEFAULT_INSPIRATION_IMAGE_MAX_BYTES = MAX_INSPIRATION_IMAGE_BYTES
export const DEFAULT_INSPIRATION_DISK_CACHE_MAX_BYTES = MAX_INSPIRATION_DISK_CACHE_BYTES

export function inspirationDiskCacheDir(): string {
  const home = process.env.USERPROFILE || process.env.HOME || homedir()
  return join(home, '.dsh', 'cache', 'dsh-image-gen', 'inspiration')
}
export const INSPIRATION_DISK_CACHE_DIR = inspirationDiskCacheDir()
export const INSPIRATION_CATALOG_FILE = 'catalog.json'

const CASE_IDS = [
  'golden-hour-portrait',
  'neon-city-rain',
  'quiet-coastal-house',
  'ceramic-still-life',
  'misty-pine-forest',
  'editorial-sneaker',
  'watercolor-market',
  'fantasy-library',
] as const
export const INSPIRATION_CASE_IDS = CASE_IDS
/** Alias used by integrations that call the list an allowlist. */
export const INSPIRATION_CASE_ALLOWLIST = CASE_IDS
export type InspirationCaseId = typeof CASE_IDS[number]

export type InspirationImageMediaType = 'image/svg+xml' | 'image/webp' | 'image/png' | 'image/jpeg' | 'image/gif'

export interface InspirationCase {
  id: InspirationCaseId
  title: string
  description: string
  prompt: string
  category: InspirationCategory
  style: InspirationStyle
  scene: InspirationScene
  /** Relative path under the fixed inspiration repository directory. */
  imagePath: string
  imageMediaType: InspirationImageMediaType
  /** `builtin` is used for local records; remote records may carry a fixed URL. */
  source: 'builtin' | InspirationRemoteSource
  sourceUrl?: string
}

export type InspirationCatalogSource = 'builtin' | InspirationRemoteSource

export interface InspirationCatalog {
  version: 1
  updatedAt: number
  source: InspirationCatalogSource
  categories: readonly InspirationCategory[]
  styles: readonly InspirationStyle[]
  scenes: readonly InspirationScene[]
  cases: readonly InspirationCase[]
}

/** Query/filter shape consumed by `/catalog`. */
export interface InspirationFilters {
  category?: InspirationCategory
  style?: InspirationStyle
  scene?: InspirationScene
  caseId?: InspirationCaseId
  source?: 'builtin' | InspirationRemoteSource
  /** Optional fixed source URL filter; arbitrary browser URLs are rejected. */
  sourceUrl?: string
}

/** Built-in records keep the feature useful offline without shipping binaries. */
export const BUILTIN_INSPIRATION_CASES: readonly InspirationCase[] = [
  {
    id: 'golden-hour-portrait',
    title: 'Golden-hour portrait',
    description: 'Warm editorial portrait with a gentle late-afternoon glow.',
    prompt: 'Editorial portrait of a thoughtful person by a sunlit window, warm golden-hour rim light, soft film grain, natural skin texture, quiet contemporary styling, balanced negative space.',
    category: 'portrait',
    style: 'editorial',
    scene: 'studio',
    imagePath: 'images/golden-hour-portrait.svg',
    imageMediaType: 'image/svg+xml',
    source: 'builtin',
  },
  {
    id: 'neon-city-rain',
    title: 'Neon city rain',
    description: 'Cinematic night street scene with reflections and color contrast.',
    prompt: 'Cinematic rainy city street at night, magenta and cyan neon reflected in puddles, one umbrella in the distance, atmospheric haze, detailed wide composition, no logos or text.',
    category: 'landscape',
    style: 'cinematic',
    scene: 'urban',
    imagePath: 'images/neon-city-rain.svg',
    imageMediaType: 'image/svg+xml',
    source: 'builtin',
  },
  {
    id: 'quiet-coastal-house',
    title: 'Quiet coastal house',
    description: 'Minimal architecture study in calm morning light.',
    prompt: 'Minimal coastal house on a low cliff above a calm sea, pale morning light, clean concrete and warm wood, a few windswept grasses, architectural photography, generous negative space.',
    category: 'architecture',
    style: 'minimal',
    scene: 'coastal',
    imagePath: 'images/quiet-coastal-house.svg',
    imageMediaType: 'image/svg+xml',
    source: 'builtin',
  },
  {
    id: 'ceramic-still-life',
    title: 'Ceramic still life',
    description: 'A small product composition with tactile studio shadows.',
    prompt: 'Product still life of handmade ceramic vessels in sand, ivory, and terracotta, soft side lighting, subtle shadows, matte paper backdrop, premium catalog photography, centered composition.',
    category: 'product',
    style: 'photorealistic',
    scene: 'studio',
    imagePath: 'images/ceramic-still-life.svg',
    imageMediaType: 'image/svg+xml',
    source: 'builtin',
  },
  {
    id: 'misty-pine-forest',
    title: 'Misty pine forest',
    description: 'Layered natural depth for a quiet, atmospheric landscape.',
    prompt: 'Misty pine forest at dawn, layered blue-green hills, a narrow trail disappearing into fog, soft diffused light, peaceful natural color palette, detailed landscape photography.',
    category: 'nature',
    style: 'photorealistic',
    scene: 'forest',
    imagePath: 'images/misty-pine-forest.svg',
    imageMediaType: 'image/svg+xml',
    source: 'builtin',
  },
  {
    id: 'editorial-sneaker',
    title: 'Editorial sneaker',
    description: 'Graphic fashion still life with a crisp magazine feel.',
    prompt: 'Editorial fashion still life of a white sneaker floating above a cobalt geometric plinth, hard directional light, crisp shadows, clean magazine art direction, high detail, no brand marks.',
    category: 'product',
    style: 'editorial',
    scene: 'studio',
    imagePath: 'images/editorial-sneaker.svg',
    imageMediaType: 'image/svg+xml',
    source: 'builtin',
  },
  {
    id: 'watercolor-market',
    title: 'Watercolor market',
    description: 'Loose hand-painted color and people in a lively square.',
    prompt: 'Loose watercolor illustration of a lively morning market square, striped awnings, flower stalls, small figures in motion, paper texture, airy washes, joyful but restrained palette.',
    category: 'illustration',
    style: 'watercolor',
    scene: 'urban',
    imagePath: 'images/watercolor-market.svg',
    imageMediaType: 'image/svg+xml',
    source: 'builtin',
  },
  {
    id: 'fantasy-library',
    title: 'Fantasy library',
    description: 'A storybook interior with a luminous impossible ceiling.',
    prompt: 'Whimsical fantasy library with towering shelves, spiral staircases, floating candles, and a starlit glass ceiling, richly detailed storybook illustration, warm amber and indigo lighting.',
    category: 'illustration',
    style: 'anime',
    scene: 'fantasy',
    imagePath: 'images/fantasy-library.svg',
    imageMediaType: 'image/svg+xml',
    source: 'builtin',
  },
]
/** Short alias for integrations that render the representative cases directly. */
export const INSPIRATION_CASES = BUILTIN_INSPIRATION_CASES

const CASE_BY_ID = new Map<string, InspirationCase>(BUILTIN_INSPIRATION_CASES.map((item) => [item.id, item]))

/** Create the offline catalog. The returned arrays are fresh and safe to filter. */
export function builtinInspirationCatalog(now = Date.now()): InspirationCatalog {
  return {
    version: 1,
    updatedAt: now,
    source: 'builtin',
    categories: [...INSPIRATION_CATEGORIES],
    styles: [...INSPIRATION_STYLES],
    scenes: [...INSPIRATION_SCENES],
    cases: BUILTIN_INSPIRATION_CASES.map((item) => ({ ...item })),
  }
}

/** Compatibility alias for consumers that prefer `get*` naming. */
export const getBuiltinInspirationCatalog = builtinInspirationCatalog

export function isInspirationCaseId(value: unknown): value is InspirationCaseId {
  return typeof value === 'string' && (CASE_IDS as readonly string[]).includes(value)
}

export function isInspirationCategory(value: unknown): value is InspirationCategory {
  return typeof value === 'string' && (INSPIRATION_CATEGORIES as readonly string[]).includes(value)
}

export function isInspirationStyle(value: unknown): value is InspirationStyle {
  return typeof value === 'string' && (INSPIRATION_STYLES as readonly string[]).includes(value)
}

export function isInspirationScene(value: unknown): value is InspirationScene {
  return typeof value === 'string' && (INSPIRATION_SCENES as readonly string[]).includes(value)
}

export function isInspirationSource(value: unknown): value is InspirationSource {
  return value === 'builtin' || (typeof value === 'string' && (INSPIRATION_SOURCE_IDS as readonly string[]).includes(value))
}

/**
 * Parse only absolute HTTP(S) URLs without credentials, fragments, or query
 * strings. Returning a URL object avoids string-prefix parsing pitfalls.
 */
export function parseHttpSourceUrl(value: unknown): URL | undefined {
  if (typeof value !== 'string') return undefined
  const text = value.trim()
  if (text.length === 0 || text.length > 2048) return undefined
  let parsed: URL
  try {
    parsed = new URL(text)
  } catch {
    return undefined
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return undefined
  if (parsed.username !== '' || parsed.password !== '' || parsed.hash !== '' || parsed.search !== '') return undefined
  if (parsed.hostname === '') return undefined
  return parsed
}

/**
 * Check a source URL against the fixed repository host/path allowlist. The
 * optional relative path makes the check suitable for a specific case asset.
 */
export function isAllowedInspirationSourceUrl(value: unknown, relativePath?: string): boolean {
  const parsed = parseHttpSourceUrl(value)
  if (!parsed) return false
  if (relativePath !== undefined && !safeImagePath(relativePath)) return false
  return INSPIRATION_SOURCE_IDS.some((source) => {
    const base = new URL(INSPIRATION_SOURCE_URLS[source])
    if (parsed.origin !== base.origin) return false
    const prefix = `${base.pathname.replace(/\/$/, '')}/`
    if (!parsed.pathname.startsWith(prefix)) return false
    const candidatePath = parsed.pathname.slice(prefix.length)
    if (relativePath !== undefined) return candidatePath === relativePath
    if (candidatePath === INSPIRATION_CATALOG_FILE) return true
    if (!safeImagePath(candidatePath)) return false
    return CASE_IDS.some((caseId) => CASE_BY_ID.get(caseId)?.imagePath === candidatePath)
  })
}

/** Short aliases used by route/client integrations. */
export const isSafeInspirationSourceUrl = isAllowedInspirationSourceUrl
export const isSafeHttpSourceUrl = isAllowedInspirationSourceUrl
export const parseSourceUrl = parseHttpSourceUrl
export const parseHttpSource = parseHttpSourceUrl

function safeImagePath(value: string): boolean {
  return /^images\/(?:[a-z0-9]+-)*[a-z0-9]+\.(?:svg|webp|png|jpe?g)$/u.test(value)
}

function sourceUrlForPath(source: InspirationRemoteSource, relativePath: string): string {
  return `${INSPIRATION_SOURCE_URLS[source]}/${relativePath}`
}

/** Candidate order is intentionally mirror → jsDelivr → GitHub. */
export function inspirationCatalogSourceUrls(): readonly string[] {
  return INSPIRATION_SOURCE_IDS.map((source) => sourceUrlForPath(source, INSPIRATION_CATALOG_FILE))
}

export function inspirationImageSourceUrls(item: InspirationCase | InspirationCaseId): readonly string[] {
  const caseRecord = typeof item === 'string' ? CASE_BY_ID.get(item) : item
  if (!caseRecord || !isInspirationCaseId(caseRecord.id) || !safeImagePath(caseRecord.imagePath)) return []
  return INSPIRATION_SOURCE_IDS.map((source) => sourceUrlForPath(source, caseRecord.imagePath))
}

export const getInspirationImageSourceUrls = inspirationImageSourceUrls

/** Read a record without trusting inherited/prototype properties. */
function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function boundedString(value: unknown, maxLength: number): string | undefined {
  return typeof value === 'string' && value.trim() !== '' && value.length <= maxLength ? value.trim() : undefined
}

function parseSourceField(value: unknown, expectedPath: string): { source: 'builtin' | InspirationRemoteSource; sourceUrl?: string } | undefined {
  if (value === undefined || value === 'builtin') return { source: 'builtin' }
  if (typeof value === 'string' && (INSPIRATION_SOURCE_IDS as readonly string[]).includes(value)) {
    return { source: value as InspirationRemoteSource }
  }
  const sourceUrl = parseHttpSourceUrl(value)
  if (!sourceUrl || !isAllowedInspirationSourceUrl(sourceUrl.href, expectedPath)) return undefined
  const sourceId = INSPIRATION_SOURCE_IDS.find((candidate) => {
    const base = new URL(INSPIRATION_SOURCE_URLS[candidate])
    return sourceUrl.origin === base.origin && sourceUrl.pathname.startsWith(`${base.pathname.replace(/\/$/, '')}/`)
  })
  if (sourceId === undefined) return undefined
  return { source: sourceId, sourceUrl: sourceUrl.href }
}

function parseCase(value: unknown): InspirationCase | undefined {
  const root = record(value)
  if (!root || !isInspirationCaseId(root.id)) return undefined
  const id = root.id
  const title = boundedString(root.title, 160)
  const description = boundedString(root.description, 320)
  const prompt = boundedString(root.prompt, 4000)
  const category = root.category
  const style = root.style
  const scene = root.scene
  const imagePath = boundedString(root.imagePath, 180)
  const imageMediaType = root.imageMediaType
  const expectedImagePath = CASE_BY_ID.get(id)?.imagePath
  if (!title || !description || !prompt || !isInspirationCategory(category) || !isInspirationStyle(style) || !isInspirationScene(scene) || !imagePath || !safeImagePath(imagePath) || imagePath !== expectedImagePath) return undefined
  if (imageMediaType !== 'image/svg+xml' && imageMediaType !== 'image/webp' && imageMediaType !== 'image/png' && imageMediaType !== 'image/jpeg' && imageMediaType !== 'image/gif') return undefined
  const sourceInfo = parseSourceField(root.sourceUrl ?? root.source, imagePath)
  if (!sourceInfo) return undefined
  return {
    id,
    title,
    description,
    prompt,
    category,
    style,
    scene,
    imagePath,
    imageMediaType,
    source: sourceInfo.source,
    ...(sourceInfo.sourceUrl === undefined ? {} : { sourceUrl: sourceInfo.sourceUrl }),
  }
}

/**
 * Validate a remote catalog while retaining only the fixed schema/case set.
 * Unknown fields are ignored; unknown case ids/categories/styles/scenes reject
 * the catalog rather than silently broadening the allowlist.
 */
export function parseInspirationCatalog(value: unknown): InspirationCatalog | undefined {
  const root = record(value)
  if (!root || (root.version !== undefined && root.version !== 1)) return undefined
  if (!Array.isArray(root.cases) || root.cases.length === 0 || root.cases.length > CASE_IDS.length) return undefined
  const parsedCases: InspirationCase[] = []
  const seen = new Set<string>()
  for (const item of root.cases) {
    const parsed = parseCase(item)
    if (!parsed || seen.has(parsed.id)) return undefined
    seen.add(parsed.id)
    parsedCases.push(parsed)
  }
  const updatedAt = typeof root.updatedAt === 'number' && Number.isFinite(root.updatedAt) ? root.updatedAt : Date.now()
  const source = isInspirationSource(root.source) ? root.source : 'builtin'
  return {
    version: 1,
    updatedAt,
    source,
    categories: [...INSPIRATION_CATEGORIES],
    styles: [...INSPIRATION_STYLES],
    scenes: [...INSPIRATION_SCENES],
    cases: parsedCases,
  }
}

/** Parse URL query/record filters against the fixed category/style/scene sets. */
export function parseInspirationFilters(value: unknown): InspirationFilters | undefined {
  const entries = new Map<string, unknown>()
  const allowedKeys = new Set(['category', 'style', 'scene', 'caseId', 'case', 'source', 'sourceUrl'])
  if (typeof value === 'string') {
    let query = value
    try {
      if (query.includes('://')) query = new URL(query).search
    } catch {
      return undefined
    }
    const params = new URLSearchParams(query.startsWith('?') ? query.slice(1) : query)
    for (const [key, raw] of params.entries()) {
      if (!allowedKeys.has(key) || entries.has(key)) return undefined
      entries.set(key, raw)
    }
  } else if (value instanceof URLSearchParams) {
    for (const [key, raw] of value.entries()) {
      if (!allowedKeys.has(key) || entries.has(key)) return undefined
      entries.set(key, raw)
    }
  } else {
    const root = record(value)
    if (!root) return value === undefined || value === null ? {} : undefined
    for (const key of Object.keys(root)) {
      if (!allowedKeys.has(key)) return undefined
      if (root[key] !== undefined) entries.set(key, root[key])
    }
  }

  if (entries.has('caseId') && entries.has('case')) return undefined

  const result: InspirationFilters = {}
  const category = entries.get('category')
  const style = entries.get('style')
  const scene = entries.get('scene')
  const caseId = entries.get('caseId') ?? entries.get('case')
  const source = entries.get('source')
  const sourceUrl = entries.get('sourceUrl')
  if (category !== undefined && category !== '' && !isInspirationCategory(category)) return undefined
  if (style !== undefined && style !== '' && !isInspirationStyle(style)) return undefined
  if (scene !== undefined && scene !== '' && !isInspirationScene(scene)) return undefined
  if (caseId !== undefined && caseId !== '' && !isInspirationCaseId(caseId)) return undefined
  if (source !== undefined && source !== '' && !isInspirationSource(source)) return undefined
  if (sourceUrl !== undefined && sourceUrl !== '' && !isAllowedInspirationSourceUrl(sourceUrl)) return undefined
  if (isInspirationCategory(category)) result.category = category
  if (isInspirationStyle(style)) result.style = style
  if (isInspirationScene(scene)) result.scene = scene
  if (isInspirationCaseId(caseId)) result.caseId = caseId
  if (isInspirationSource(source)) result.source = source
  if (typeof sourceUrl === 'string' && sourceUrl !== '') result.sourceUrl = parseHttpSourceUrl(sourceUrl)!.href
  return result
}

export const parseInspirationQuery = parseInspirationFilters
export const parseInspirationFilter = parseInspirationFilters

/** Filter a catalog without mutating its case array. */
export function filterInspirationCases(cases: readonly InspirationCase[], filters: InspirationFilters = {}): InspirationCase[] {
  return cases.filter((item) => {
    if (filters.category !== undefined && item.category !== filters.category) return false
    if (filters.style !== undefined && item.style !== filters.style) return false
    if (filters.scene !== undefined && item.scene !== filters.scene) return false
    if (filters.caseId !== undefined && item.id !== filters.caseId) return false
    if (filters.source !== undefined && item.source !== filters.source) return false
    if (filters.sourceUrl !== undefined && item.sourceUrl !== filters.sourceUrl) return false
    return true
  }).map((item) => ({ ...item }))
}

/** Resolve only a case from the built-in allowlist. */
export function getInspirationCase(caseId: unknown): InspirationCase | undefined {
  if (!isInspirationCaseId(caseId)) return undefined
  const item = CASE_BY_ID.get(caseId)
  return item === undefined ? undefined : { ...item }
}

/** Read a bounded HTTP response stream; never buffers beyond `maxBytes`. */
export async function readResponseBytes(response: Response, maxBytes: number): Promise<Uint8Array> {
  const limit = Number.isFinite(maxBytes) && maxBytes >= 0 ? Math.floor(maxBytes) : 0
  const contentLength = response.headers.get('content-length')
  if (contentLength !== null) {
    const advertised = Number(contentLength)
    if (Number.isFinite(advertised) && advertised > limit) {
      await response.body?.cancel().catch(() => undefined)
      throw new InspirationPayloadTooLargeError(limit)
    }
  }
  if (!response.body) {
    const data = new Uint8Array(await response.arrayBuffer())
    if (data.byteLength > limit) throw new InspirationPayloadTooLargeError(limit)
    return data
  }
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const next = await reader.read()
      if (next.done) break
      const chunk = next.value
      total += chunk.byteLength
      if (total > limit) throw new InspirationPayloadTooLargeError(limit)
      chunks.push(chunk)
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

export class InspirationPayloadTooLargeError extends Error {
  readonly code = 'inspiration-payload-too-large'
  readonly limit: number

  constructor(limit: number) {
    super(`Inspiration response exceeds the ${limit}-byte limit`)
    this.name = 'InspirationPayloadTooLargeError'
    this.limit = limit
  }
}

export interface InspirationFetchResult {
  data: Uint8Array
  url: string
  response: Response
}

export interface InspirationFetchOptions {
  fetch?: typeof globalThis.fetch
  signal?: AbortSignal | undefined
  maxBytes: number
}

/** Fetch fixed candidates in order, rejecting redirects and oversized streams. */
export async function fetchInspirationCandidates(
  urls: readonly string[],
  options: InspirationFetchOptions,
): Promise<InspirationFetchResult> {
  const fetchImpl = options.fetch ?? globalThis.fetch
  if (typeof fetchImpl !== 'function') throw new Error('Fetch is unavailable')
  let lastError: unknown
  for (const url of urls) {
    if (options.signal?.aborted) throw inspirationAbortError()
    if (!isAllowedInspirationSourceUrl(url) && !inspirationCatalogSourceUrls().includes(url)) {
      lastError = new Error('Source URL is not allowlisted')
      continue
    }
    try {
      const response = await fetchImpl(url, {
        method: 'GET',
        redirect: 'error',
        headers: { accept: 'application/json,image/*' },
        ...(options.signal === undefined ? {} : { signal: options.signal }),
      })
      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined)
        lastError = new Error(`HTTP ${response.status}`)
        continue
      }
      const data = await readResponseBytes(response, options.maxBytes)
      return { data, url, response }
    } catch (error) {
      if (options.signal?.aborted) throw inspirationAbortError()
      lastError = error
    }
  }
  throw lastError instanceof Error ? lastError : new Error('All inspiration sources failed')
}

function inspirationAbortError(): Error {
  const error = new Error('Inspiration request aborted')
  error.name = 'AbortError'
  return error
}

/** Small deterministic offline preview; no binary assets are shipped. */
export function builtinInspirationSvg(item: InspirationCase | InspirationCaseId): string {
  const resolved = typeof item === 'string' ? CASE_BY_ID.get(item) : item
  if (!resolved) return ''
  const palettes: Record<InspirationCaseId, readonly [string, string, string]> = {
    'golden-hour-portrait': ['#2b1b2d', '#e58d5c', '#ffd9a0'],
    'neon-city-rain': ['#11183f', '#d94b9b', '#55e9e0'],
    'quiet-coastal-house': ['#7da8b5', '#e5d4b0', '#f8f1de'],
    'ceramic-still-life': ['#4b3430', '#c98766', '#f1ddc4'],
    'misty-pine-forest': ['#1d3940', '#6e9b91', '#d6e5cf'],
    'editorial-sneaker': ['#152a64', '#3d6be0', '#f3f4f6'],
    'watercolor-market': ['#ee9b65', '#f4d06f', '#7097b5'],
    'fantasy-library': ['#171837', '#5b4c9c', '#f1bf67'],
  }
  const [start, middle, end] = palettes[resolved.id]
  const title = escapeXml(resolved.title)
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 640" role="img" aria-labelledby="title"><title id="title">${title}</title><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${start}"/><stop offset=".55" stop-color="${middle}"/><stop offset="1" stop-color="${end}"/></linearGradient><radialGradient id="glow"><stop stop-color="#fff" stop-opacity=".75"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs><rect width="960" height="640" fill="url(#bg)"/><circle cx="760" cy="120" r="180" fill="url(#glow)" opacity=".45"/><path d="M0 510 Q180 430 360 510 T720 490 T960 500 V640 H0Z" fill="#101727" opacity=".42"/><path d="M70 115h360M70 145h260" stroke="#fff" stroke-opacity=".65" stroke-width="8" stroke-linecap="round"/><text x="70" y="560" fill="#fff" fill-opacity=".9" font-family="system-ui,sans-serif" font-size="32" font-weight="600">${title}</text></svg>`
}

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/gu, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character] ?? character)
}

/** Promise-based disk cache; every filesystem error is intentionally ignored. */
export interface InspirationDiskCacheOptions {
  directory?: string
  maxBytes?: number
}

export class InspirationDiskCache {
  readonly directory: string
  readonly maxBytes: number
  private queue: Promise<void> = Promise.resolve()

  constructor(options: InspirationDiskCacheOptions = {}) {
    this.directory = options.directory ?? inspirationDiskCacheDir()
    this.maxBytes = Number.isFinite(options.maxBytes) && (options.maxBytes ?? 0) > 0
      ? Math.floor(options.maxBytes as number)
      : MAX_INSPIRATION_DISK_CACHE_BYTES
  }

  get(key: string): Promise<Uint8Array | undefined> {
    return this.enqueue(async () => {
      const path = this.pathForKey(key)
      try {
        const info = await lstat(path)
        if (info.isSymbolicLink() || !info.isFile() || info.size > this.maxBytes) return undefined
        const data = new Uint8Array(await readFile(path))
        try {
          const now = new Date()
          await utimes(path, now, now)
        } catch {
          /* Best-effort atime for LRU; a read still succeeds when utimes fails. */
        }
        return data
      } catch {
        return undefined
      }
    }, undefined)
  }

  set(key: string, data: Uint8Array): Promise<void> {
    return this.enqueue(async () => {
      if (data.byteLength > this.maxBytes) return
      try {
        await mkdir(this.directory, { recursive: true })
        const path = this.pathForKey(key)
        const temporary = `${path}.${process.pid}.${Date.now()}.tmp`
        await writeFile(temporary, data)
        await rename(temporary, path)
        await this.trim()
      } catch {
        /* Cache failures never affect the request path. */
      }
    }, undefined)
  }

  /** Alias for clients that use read/write terminology. */
  read(key: string): Promise<Uint8Array | undefined> { return this.get(key) }
  write(key: string, data: Uint8Array): Promise<void> { return this.set(key, data) }

  delete(key: string): Promise<void> {
    return this.enqueue(async () => {
      try {
        await rm(this.pathForKey(key), { force: true })
      } catch {
        /* ignored */
      }
    }, undefined)
  }

  clear(): Promise<void> {
    return this.enqueue(async () => {
      try {
        await rm(this.directory, { recursive: true, force: true })
      } catch {
        /* ignored */
      }
    }, undefined)
  }

  private pathForKey(key: string): string {
    const digest = createHash('sha256').update(String(key)).digest('hex')
    return join(this.directory, `${digest}.bin`)
  }

  private async trim(): Promise<void> {
    const entries: { path: string; bytes: number; mtimeMs: number }[] = []
    let total = 0
    try {
      const names = await readdir(this.directory)
      for (const name of names) {
        if (!name.endsWith('.bin')) continue
        try {
          const path = join(this.directory, name)
          const info = await stat(path)
          if (!info.isFile()) continue
          entries.push({ path, bytes: info.size, mtimeMs: info.mtimeMs })
          total += info.size
        } catch {
          /* A concurrently removed entry is harmless. */
        }
      }
      entries.sort((a, b) => a.mtimeMs - b.mtimeMs)
      for (const entry of entries) {
        if (total <= this.maxBytes) break
        try {
          await rm(entry.path, { force: true })
          total -= entry.bytes
        } catch {
          /* ignored */
        }
      }
    } catch {
      /* Cache maintenance is best effort. */
    }
  }

  private enqueue<T>(operation: () => Promise<T>, fallback: T): Promise<T> {
    const result = this.queue.then(operation, operation)
    this.queue = result.then(() => undefined, () => undefined)
    return result.catch(() => fallback)
  }
}

export function createInspirationDiskCache(options: InspirationDiskCacheOptions = {}): InspirationDiskCache {
  return new InspirationDiskCache(options)
}
