/**
 * Provider-neutral Inspiration Library primitives.
 *
 * The host owns the catalog/image fetches and this module deliberately keeps
 * the remote surface closed: only the bundled case ids and the
 * three fixed repository origins below can ever be addressed. Browser callers
 * pass case ids, never URLs.
 */
import { createHash } from 'node:crypto'
import { lstat, mkdir, readdir, readFile, rename, rm, stat, utimes, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import rawAwesomeGptImage2 from './inspiration/data/awesome-gpt-image-2.json' with { type: 'json' }
import { INSPIRATION_SOURCE_REF } from './shared.js'

/** Same-origin route prefix used by the host and browser faces. */
export const INSPIRATION_ROUTE_PREFIX = '/plugins/dsh-image-gen/inspiration'
export const INSPIRATION_CATALOG_ROUTE = `${INSPIRATION_ROUTE_PREFIX}/catalog`
export const INSPIRATION_REFRESH_ROUTE = `${INSPIRATION_ROUTE_PREFIX}/refresh`
export const INSPIRATION_CACHE_CLEAR_ROUTE = `${INSPIRATION_ROUTE_PREFIX}/cache-clear`
export const INSPIRATION_IMAGE_ROUTE = `${INSPIRATION_ROUTE_PREFIX}/image`

/**
 * The dimensions are part of the bundled upstream snapshot, not a hand-written
 * six-item allowlist. They remain fixed at runtime until the package is rebuilt.
 */
interface UpstreamCatalogDocument {
  repository?: unknown
  totalCases?: unknown
  categories?: unknown
  styles?: unknown
  scenes?: unknown
  cases?: unknown
}

const UPSTREAM_CATALOG = rawAwesomeGptImage2 as unknown as UpstreamCatalogDocument
const UPSTREAM_SOURCE_VERSION = 'c7d293963b21c60bf338003915438cc5c39dd3ca'
const DEFAULT_DIMENSION = 'Other Use Cases'

function dimensionValues(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const result: string[] = []
  const seen = new Set<string>()
  for (const entry of value) {
    if (typeof entry !== 'string' || entry.length === 0 || seen.has(entry)) continue
    seen.add(entry)
    result.push(entry)
  }
  return result
}

export const INSPIRATION_CATEGORIES = dimensionValues(UPSTREAM_CATALOG.categories)
export const INSPIRATION_CATEGORY_ALLOWLIST = INSPIRATION_CATEGORIES
export const INSPIRATION_STYLES = dimensionValues(UPSTREAM_CATALOG.styles)
export const INSPIRATION_STYLE_ALLOWLIST = INSPIRATION_STYLES
export const INSPIRATION_SCENES = dimensionValues(UPSTREAM_CATALOG.scenes)
export const INSPIRATION_SCENE_ALLOWLIST = INSPIRATION_SCENES

export type InspirationCategory = string
export type InspirationStyle = string
export type InspirationScene = string

/** Versioned upstream repository used for optional catalog/image refreshes. */
export const INSPIRATION_REPOSITORY = {
  owner: 'freestylefly',
  name: 'awesome-gpt-image-2',
  // The version marker is an immutable upstream commit/content ref. Do not
  // replace it with a mutable branch when changing the bundled snapshot.
  ref: INSPIRATION_SOURCE_REF,
  directory: 'data',
} as const

/** Only these fixed hosts and path prefixes are ever fetched by the host. */
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

/** Limits used by the host fetcher and disk cache. The upstream JSON is ~1.3MB. */
export const MAX_INSPIRATION_CASES = 2_000
export const MAX_INSPIRATION_CATALOG_BYTES = 4 * 1024 * 1024
export const MAX_INSPIRATION_IMAGE_BYTES = 8 * 1024 * 1024
export const MAX_INSPIRATION_DISK_CACHE_BYTES = 32 * 1024 * 1024
/** Compatibility aliases for callers that prefer a `DEFAULT_*` spelling. */
export const DEFAULT_INSPIRATION_CATALOG_MAX_BYTES = MAX_INSPIRATION_CATALOG_BYTES
export const DEFAULT_INSPIRATION_IMAGE_MAX_BYTES = MAX_INSPIRATION_IMAGE_BYTES
export const DEFAULT_INSPIRATION_DISK_CACHE_MAX_BYTES = MAX_INSPIRATION_DISK_CACHE_BYTES

export const INSPIRATION_SOURCE_ID = 'awesome-gpt-image-2'
export const INSPIRATION_SOURCE_VERSION = UPSTREAM_SOURCE_VERSION
export const INSPIRATION_SOURCE_REPOSITORY = 'https://github.com/freestylefly/awesome-gpt-image-2'
/** SHA-256 of JSON.stringify(the pinned upstream document), independent of whitespace. */
export const INSPIRATION_SOURCE_INTEGRITY_SHA256 = '2c3fa2e62887d3d50c8f9684f84949201daeefabec9c15dbe744bd8f55db1304'

export function inspirationDiskCacheDir(): string {
  const home = process.env.USERPROFILE || process.env.HOME || homedir()
  return join(home, '.dsh', 'cache', 'dsh-image-gen', 'inspiration')
}
export const INSPIRATION_DISK_CACHE_DIR = inspirationDiskCacheDir()
export const INSPIRATION_CATALOG_FILE = 'cases.json'

const CASE_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u
export const INSPIRATION_CASE_IDS = [] as string[]
/** Alias used by integrations that call the list an allowlist. */
export const INSPIRATION_CASE_ALLOWLIST = INSPIRATION_CASE_IDS
export type InspirationCaseId = string

export type InspirationImageMediaType = 'image/svg+xml' | 'image/webp' | 'image/png' | 'image/jpeg' | 'image/gif'

export interface InspirationCase {
  /** Stable browser/cache id derived from the upstream numeric id. */
  id: InspirationCaseId
  /** Original upstream numeric id, retained for lossless catalog mapping. */
  upstreamId: number
  title: string
  description: string
  imageAlt: string
  sourceLabel?: string
  /** Original attribution URL from the upstream record; never used as a fetch target. */
  attributionUrl?: string
  githubUrl?: string
  prompt: string
  promptPreview: string
  category: InspirationCategory
  /** Full upstream dimensions. `style`/`scene` are compatibility aliases. */
  styles: readonly InspirationStyle[]
  scenes: readonly InspirationScene[]
  style: InspirationStyle
  scene: InspirationScene
  featured: boolean
  /** Relative path under the fixed upstream data directory. */
  imagePath: string
  imageMediaType: InspirationImageMediaType
  /** `builtin` is used for local records; remote records may carry a fixed source. */
  source: 'builtin' | InspirationRemoteSource
  /** Optional allowlisted asset URL retained for compatibility with old records. */
  sourceUrl?: string
}

export type InspirationCatalogSource = 'builtin' | InspirationRemoteSource

export interface InspirationCatalog {
  /** Fork route schema version; distinct from the upstream source version. */
  version: 1
  updatedAt: number
  source: InspirationCatalogSource
  sourceId: string
  repository: string
  sourceVersion: string
  totalCases: number
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

/**
 * The complete upstream snapshot is bundled as data rather than expanded into
 * this TypeScript file. That keeps the source maintainable and makes the same
 * 541 cases available when remote refresh is unavailable.
 */
function normalizeDimensionList(value: unknown): string[] {
  return dimensionValues(value)
}

function normalizeImagePath(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const path = value.trim().replace(/^\/+/, '')
  return safeImagePath(path) ? path : undefined
}

function imageMediaTypeForPath(path: string): InspirationImageMediaType {
  const extension = path.slice(path.lastIndexOf('.') + 1).toLowerCase()
  if (extension === 'svg') return 'image/svg+xml'
  if (extension === 'webp') return 'image/webp'
  if (extension === 'png') return 'image/png'
  if (extension === 'gif') return 'image/gif'
  return 'image/jpeg'
}

function matchesUpstreamImagePath(path: string, upstreamId: number): boolean {
  return new RegExp(`^images/case${upstreamId}\\.(?:png|jpe?g|webp)$`, 'u').test(path)
}

function normalizeUpstreamCase(value: unknown, source: InspirationSource): InspirationCase | undefined {
  const root = record(value)
  if (!root) return undefined
  const upstreamId = root.id
  if (typeof upstreamId !== 'number' || !Number.isSafeInteger(upstreamId) || upstreamId <= 0) return undefined
  const imagePath = normalizeImagePath(root.image)
  const title = boundedString(root.title, 240)
  const prompt = boundedString(root.prompt, 16_000)
  if (!imagePath || !title || !prompt || !matchesUpstreamImagePath(imagePath, upstreamId)) return undefined
  const id = String(upstreamId)
  const promptPreview = boundedString(root.promptPreview, 600) ?? prompt.slice(0, 280)
  const imageAlt = boundedString(root.imageAlt, 320) ?? title
  const styles = normalizeDimensionList(root.styles)
  const scenes = normalizeDimensionList(root.scenes)
  const category = boundedString(root.category, 120) ?? DEFAULT_DIMENSION
  const style = styles[0] ?? DEFAULT_DIMENSION
  const scene = scenes[0] ?? DEFAULT_DIMENSION
  const sourceLabel = boundedString(root.sourceLabel, 240)
  const attributionUrl = parseHttpSourceUrl(root.sourceUrl)?.href
  const githubUrl = parseHttpSourceUrl(root.githubUrl)?.href
  return {
    id,
    upstreamId,
    title,
    description: promptPreview,
    imageAlt,
    ...(sourceLabel === undefined ? {} : { sourceLabel }),
    ...(attributionUrl === undefined ? {} : { attributionUrl }),
    ...(githubUrl === undefined ? {} : { githubUrl }),
    prompt,
    promptPreview,
    category,
    styles,
    scenes,
    style,
    scene,
    featured: root.featured === true,
    imagePath,
    imageMediaType: imageMediaTypeForPath(imagePath),
    source,
  }
}

function parseUpstreamCases(value: unknown, source: InspirationSource): InspirationCase[] {
  const root = record(value)
  if (!Array.isArray(root?.cases)) return []
  const seen = new Set<string>()
  const cases: InspirationCase[] = []
  for (const candidate of root.cases) {
    const parsed = normalizeUpstreamCase(candidate, source)
    if (!parsed || seen.has(parsed.id)) continue
    seen.add(parsed.id)
    cases.push(parsed)
  }
  return cases
}

/** Built-in records keep the feature useful offline with the full snapshot. */
export const BUILTIN_INSPIRATION_CASES: readonly InspirationCase[] = parseUpstreamCases(UPSTREAM_CATALOG, 'builtin')
if (BUILTIN_INSPIRATION_CASES.length === 0) throw new Error('Bundled inspiration catalog is empty')
INSPIRATION_CASE_IDS.push(...BUILTIN_INSPIRATION_CASES.map((item) => item.id))

/** Short alias used by integrations that render representative cases directly. */
export const INSPIRATION_CASES = BUILTIN_INSPIRATION_CASES

const CASE_BY_ID = new Map<string, InspirationCase>(BUILTIN_INSPIRATION_CASES.map((item) => [item.id, item]))

function cloneCase(item: InspirationCase): InspirationCase {
  return { ...item, styles: [...item.styles], scenes: [...item.scenes] }
}

/** Create the offline catalog. The returned arrays are fresh and safe to filter. */
export function builtinInspirationCatalog(now = Date.now()): InspirationCatalog {
  return {
    version: 1,
    updatedAt: now,
    source: 'builtin',
    sourceId: INSPIRATION_SOURCE_ID,
    repository: typeof UPSTREAM_CATALOG.repository === 'string' ? UPSTREAM_CATALOG.repository : INSPIRATION_SOURCE_REPOSITORY,
    sourceVersion: INSPIRATION_SOURCE_VERSION,
    totalCases: BUILTIN_INSPIRATION_CASES.length,
    categories: [...INSPIRATION_CATEGORIES],
    styles: [...INSPIRATION_STYLES],
    scenes: [...INSPIRATION_SCENES],
    cases: BUILTIN_INSPIRATION_CASES.map(cloneCase),
  }
}

/** Compatibility alias for consumers that prefer `get*` naming. */
export const getBuiltinInspirationCatalog = builtinInspirationCatalog

export function isInspirationCaseId(value: unknown): value is InspirationCaseId {
  return typeof value === 'string' && CASE_ID_PATTERN.test(value)
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
  if (text.length === 0 || text.length > 2048 || text.includes('\\')) return undefined
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
 * The host set stays the fork's mirror → jsDelivr → GitHub trio; only the
 * versioned upstream data path and its safe image names are accepted.
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
    return candidatePath === INSPIRATION_CATALOG_FILE || safeImagePath(candidatePath)
  })
}

/** Short aliases used by route/client integrations. */
export const isSafeInspirationSourceUrl = isAllowedInspirationSourceUrl
export const isSafeHttpSourceUrl = isAllowedInspirationSourceUrl
export const parseSourceUrl = parseHttpSourceUrl
export const parseHttpSource = parseHttpSourceUrl

function safeImagePath(value: string): boolean {
  return /^images\/(?:[A-Za-z0-9][A-Za-z0-9._-]*\/)*[A-Za-z0-9][A-Za-z0-9._-]*\.(?:svg|webp|png|jpe?g|gif)$/u.test(value)
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
  return typeof value === 'string' && value.trim() !== '' && value.length <= maxLength ? value : undefined
}

function parseSourceField(value: unknown, expectedPath: string, fallback: InspirationSource = 'builtin'): { source: InspirationSource; sourceUrl?: string } | undefined {
  if (value === undefined || value === 'builtin') return { source: fallback }
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

function uniqueDimensions(cases: readonly InspirationCase[], field: 'category' | 'style' | 'scene'): string[] {
  const result: string[] = []
  const seen = new Set<string>()
  for (const item of cases) {
    const values = field === 'category' ? [item.category] : field === 'style' ? item.styles : item.scenes
    for (const value of values) {
      if (!value || seen.has(value)) continue
      seen.add(value)
      result.push(value)
    }
  }
  return result
}

function parseCase(value: unknown, fallbackSource: InspirationSource = 'builtin'): InspirationCase | undefined {
  const root = record(value)
  const id = boundedString(root?.id, 120)
  if (!root || !id || !isInspirationCaseId(id)) return undefined
  const title = boundedString(root.title, 240)
  const prompt = boundedString(root.prompt, 16_000)
  const imagePath = normalizeImagePath(root.imagePath)
  if (!title || !prompt || !imagePath) return undefined
  const promptPreview = boundedString(root.promptPreview, 600) ?? prompt.slice(0, 280)
  const imageAlt = boundedString(root.imageAlt, 320) ?? title
  const description = boundedString(root.description, 600) ?? promptPreview
  const category = boundedString(root.category, 120) ?? DEFAULT_DIMENSION
  const styles = normalizeDimensionList(root.styles)
  const scenes = normalizeDimensionList(root.scenes)
  const style = boundedString(root.style, 120) ?? styles[0] ?? DEFAULT_DIMENSION
  const scene = boundedString(root.scene, 120) ?? scenes[0] ?? DEFAULT_DIMENSION
  const sourceInfo = parseSourceField(root.remoteUrl ?? root.sourceUrl ?? root.source, imagePath, fallbackSource)
  if (!sourceInfo) return undefined
  const upstreamId = typeof root.upstreamId === 'number' && Number.isSafeInteger(root.upstreamId)
    ? root.upstreamId
    : Number(/^(?:case-)?(\d+)$/u.exec(id)?.[1] ?? 0)
  if (upstreamId > 0 && (id !== String(upstreamId) || !matchesUpstreamImagePath(imagePath, upstreamId))) return undefined
  const imageMediaType = root.imageMediaType
  const resolvedMediaType = imageMediaType === undefined ? imageMediaTypeForPath(imagePath) : imageMediaType
  if (resolvedMediaType !== 'image/svg+xml' && resolvedMediaType !== 'image/webp' && resolvedMediaType !== 'image/png' && resolvedMediaType !== 'image/jpeg' && resolvedMediaType !== 'image/gif') return undefined
  const sourceLabel = boundedString(root.sourceLabel, 240)
  const attributionUrl = parseHttpSourceUrl(root.attributionUrl)?.href
  const githubUrl = parseHttpSourceUrl(root.githubUrl)?.href
  return {
    id,
    upstreamId,
    title,
    description,
    imageAlt,
    ...(sourceLabel === undefined ? {} : { sourceLabel }),
    ...(attributionUrl === undefined ? {} : { attributionUrl }),
    ...(githubUrl === undefined ? {} : { githubUrl }),
    prompt,
    promptPreview,
    category,
    styles: styles.length > 0 ? styles : [style],
    scenes: scenes.length > 0 ? scenes : [scene],
    style,
    scene,
    featured: root.featured === true,
    imagePath,
    imageMediaType: resolvedMediaType,
    source: sourceInfo.source,
    ...(sourceInfo.sourceUrl === undefined ? {} : { sourceUrl: sourceInfo.sourceUrl }),
  }
}

function catalogFromCases(root: Record<string, unknown>, parsedCases: readonly InspirationCase[], source: InspirationSource, now: number): InspirationCatalog {
  const repository = parseHttpSourceUrl(root.repository)?.href ?? INSPIRATION_SOURCE_REPOSITORY
  const sourceVersion = boundedString(root.sourceVersion ?? root.versionMarker, 128) ?? INSPIRATION_SOURCE_VERSION
  const categories = normalizeDimensionList(root.categories)
  const styles = normalizeDimensionList(root.styles)
  const scenes = normalizeDimensionList(root.scenes)
  const totalCases = typeof root.totalCases === 'number' && Number.isSafeInteger(root.totalCases) && root.totalCases >= parsedCases.length
    ? root.totalCases
    : parsedCases.length
  return {
    version: 1,
    updatedAt: typeof root.updatedAt === 'number' && Number.isFinite(root.updatedAt) ? root.updatedAt : now,
    source,
    sourceId: boundedString(root.sourceId, 120) ?? INSPIRATION_SOURCE_ID,
    repository,
    sourceVersion,
    totalCases,
    categories: categories.length > 0 ? categories : uniqueDimensions(parsedCases, 'category'),
    styles: styles.length > 0 ? styles : uniqueDimensions(parsedCases, 'style'),
    scenes: scenes.length > 0 ? scenes : uniqueDimensions(parsedCases, 'scene'),
    cases: parsedCases.map(cloneCase),
  }
}

function catalogIntegrity(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value) ?? '').digest('hex')
}

/**
 * Validate either the fork-normalized catalog or the upstream snapshot shape.
 * Unknown metadata is ignored, but malformed cases and duplicate ids reject the
 * document so a partial/poisoned catalog never replaces the offline snapshot.
 */
export function parseInspirationCatalog(value: unknown): InspirationCatalog | undefined {
  const root = record(value)
  if (!root || (root.version !== undefined && root.version !== 1)) return undefined
  if (!Array.isArray(root.cases) || root.cases.length === 0 || root.cases.length > MAX_INSPIRATION_CASES) return undefined
  const upstreamShape = root.cases.some((item) => record(item)?.image !== undefined || typeof record(item)?.id === 'number')
  if (upstreamShape && (root.repository !== INSPIRATION_SOURCE_REPOSITORY || root.totalCases !== root.cases.length || catalogIntegrity(value) !== INSPIRATION_SOURCE_INTEGRITY_SHA256)) return undefined
  const source = isInspirationSource(root.source) ? root.source : 'builtin'
  if (upstreamShape) {
    const categories = normalizeDimensionList(root.categories)
    const styles = normalizeDimensionList(root.styles)
    const scenes = normalizeDimensionList(root.scenes)
    if (
      categories.length !== INSPIRATION_CATEGORIES.length || !categories.every(isInspirationCategory)
      || styles.length !== INSPIRATION_STYLES.length || !styles.every(isInspirationStyle)
      || scenes.length !== INSPIRATION_SCENES.length || !scenes.every(isInspirationScene)
    ) return undefined
  }
  const parsedCases = upstreamShape
    ? parseUpstreamCases(root, source)
    : root.cases.map((item) => parseCase(item, source)).filter((item): item is InspirationCase => item !== undefined)
  if (upstreamShape && parsedCases.some((item) => !isInspirationCategory(item.category) || item.styles.some((value) => !isInspirationStyle(value)) || item.scenes.some((value) => !isInspirationScene(value)))) return undefined
  if (parsedCases.length !== root.cases.length) return undefined
  const seen = new Set<string>()
  if (parsedCases.some((item) => seen.has(item.id) || !seen.add(item.id))) return undefined
  return catalogFromCases(root, parsedCases, source, Date.now())
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
    if (filters.style !== undefined && !item.styles.includes(filters.style) && item.style !== filters.style) return false
    if (filters.scene !== undefined && !item.scenes.includes(filters.scene) && item.scene !== filters.scene) return false
    if (filters.caseId !== undefined && item.id !== filters.caseId) return false
    if (filters.source !== undefined && item.source !== filters.source) return false
    if (filters.sourceUrl !== undefined && item.sourceUrl !== filters.sourceUrl) return false
    return true
  }).map(cloneCase)
}

/** Resolve only a case from the bundled allowlist. */
export function getInspirationCase(caseId: unknown): InspirationCase | undefined {
  if (!isInspirationCaseId(caseId)) return undefined
  const item = CASE_BY_ID.get(caseId)
  return item === undefined ? undefined : cloneCase(item)
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
  const palettes: readonly (readonly [string, string, string])[] = [
    ['#2b1b2d', '#e58d5c', '#ffd9a0'],
    ['#11183f', '#d94b9b', '#55e9e0'],
    ['#7da8b5', '#e5d4b0', '#f8f1de'],
    ['#4b3430', '#c98766', '#f1ddc4'],
    ['#1d3940', '#6e9b91', '#d6e5cf'],
    ['#152a64', '#3d6be0', '#f3f4f6'],
    ['#ee9b65', '#f4d06f', '#7097b5'],
    ['#171837', '#5b4c9c', '#f1bf67'],
  ]
  const palette = palettes[Math.abs(resolved.upstreamId) % palettes.length] ?? palettes[0]!
  const [start, middle, end] = palette
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
