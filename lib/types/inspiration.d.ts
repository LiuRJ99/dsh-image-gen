/** Same-origin route prefix used by the host and browser faces. */
export declare const INSPIRATION_ROUTE_PREFIX = "/plugins/dsh-image-gen/inspiration";
export declare const INSPIRATION_CATALOG_ROUTE = "/plugins/dsh-image-gen/inspiration/catalog";
export declare const INSPIRATION_REFRESH_ROUTE = "/plugins/dsh-image-gen/inspiration/refresh";
export declare const INSPIRATION_CACHE_CLEAR_ROUTE = "/plugins/dsh-image-gen/inspiration/cache-clear";
export declare const INSPIRATION_IMAGE_ROUTE = "/plugins/dsh-image-gen/inspiration/image";
/** Fixed allowlists. These are intentionally small and provider independent. */
export declare const INSPIRATION_CATEGORIES: readonly ["portrait", "landscape", "product", "architecture", "nature", "illustration"];
export declare const INSPIRATION_CATEGORY_ALLOWLIST: readonly ["portrait", "landscape", "product", "architecture", "nature", "illustration"];
export declare const INSPIRATION_STYLES: readonly ["photorealistic", "cinematic", "editorial", "minimal", "watercolor", "anime"];
export declare const INSPIRATION_STYLE_ALLOWLIST: readonly ["photorealistic", "cinematic", "editorial", "minimal", "watercolor", "anime"];
export declare const INSPIRATION_SCENES: readonly ["studio", "urban", "coastal", "interior", "forest", "fantasy"];
export declare const INSPIRATION_SCENE_ALLOWLIST: readonly ["studio", "urban", "coastal", "interior", "forest", "fantasy"];
export type InspirationCategory = typeof INSPIRATION_CATEGORIES[number];
export type InspirationStyle = typeof INSPIRATION_STYLES[number];
export type InspirationScene = typeof INSPIRATION_SCENES[number];
/** Fixed remote repository used for optional catalog/image refreshes. */
export declare const INSPIRATION_REPOSITORY: {
    readonly owner: "LiuRJ99";
    readonly name: "dsh-image-gen";
    readonly ref: "ff0a9d45e2f2903fe987cf476cda95d38d500e05";
    readonly directory: "inspiration";
};
/** Only these hosts and path prefixes are ever fetched by the host. */
export declare const INSPIRATION_SOURCE_URLS: {
    readonly mirror: "https://cdn.statically.io/gh/LiuRJ99/dsh-image-gen/ff0a9d45e2f2903fe987cf476cda95d38d500e05/inspiration";
    readonly jsdelivr: "https://cdn.jsdelivr.net/gh/LiuRJ99/dsh-image-gen@ff0a9d45e2f2903fe987cf476cda95d38d500e05/inspiration";
    readonly github: "https://raw.githubusercontent.com/LiuRJ99/dsh-image-gen/ff0a9d45e2f2903fe987cf476cda95d38d500e05/inspiration";
};
export declare const INSPIRATION_SOURCE_ALLOWLIST: readonly ["https://cdn.statically.io/gh/LiuRJ99/dsh-image-gen/ff0a9d45e2f2903fe987cf476cda95d38d500e05/inspiration", "https://cdn.jsdelivr.net/gh/LiuRJ99/dsh-image-gen@ff0a9d45e2f2903fe987cf476cda95d38d500e05/inspiration", "https://raw.githubusercontent.com/LiuRJ99/dsh-image-gen/ff0a9d45e2f2903fe987cf476cda95d38d500e05/inspiration"];
export declare const INSPIRATION_SOURCE_IDS: readonly ["mirror", "jsdelivr", "github"];
export type InspirationRemoteSource = typeof INSPIRATION_SOURCE_IDS[number];
export type InspirationSource = 'builtin' | InspirationRemoteSource;
/** Limits used by the host fetcher and disk cache. */
export declare const MAX_INSPIRATION_CATALOG_BYTES: number;
export declare const MAX_INSPIRATION_IMAGE_BYTES: number;
export declare const MAX_INSPIRATION_DISK_CACHE_BYTES: number;
/** Compatibility aliases for callers that prefer a `DEFAULT_*` spelling. */
export declare const DEFAULT_INSPIRATION_CATALOG_MAX_BYTES: number;
export declare const DEFAULT_INSPIRATION_IMAGE_MAX_BYTES: number;
export declare const DEFAULT_INSPIRATION_DISK_CACHE_MAX_BYTES: number;
export declare function inspirationDiskCacheDir(): string;
export declare const INSPIRATION_DISK_CACHE_DIR: string;
export declare const INSPIRATION_CATALOG_FILE = "catalog.json";
declare const CASE_IDS: readonly ["golden-hour-portrait", "neon-city-rain", "quiet-coastal-house", "ceramic-still-life", "misty-pine-forest", "editorial-sneaker", "watercolor-market", "fantasy-library"];
export declare const INSPIRATION_CASE_IDS: readonly ["golden-hour-portrait", "neon-city-rain", "quiet-coastal-house", "ceramic-still-life", "misty-pine-forest", "editorial-sneaker", "watercolor-market", "fantasy-library"];
/** Alias used by integrations that call the list an allowlist. */
export declare const INSPIRATION_CASE_ALLOWLIST: readonly ["golden-hour-portrait", "neon-city-rain", "quiet-coastal-house", "ceramic-still-life", "misty-pine-forest", "editorial-sneaker", "watercolor-market", "fantasy-library"];
export type InspirationCaseId = typeof CASE_IDS[number];
export type InspirationImageMediaType = 'image/svg+xml' | 'image/webp' | 'image/png' | 'image/jpeg' | 'image/gif';
export interface InspirationCase {
    id: InspirationCaseId;
    title: string;
    description: string;
    prompt: string;
    category: InspirationCategory;
    style: InspirationStyle;
    scene: InspirationScene;
    /** Relative path under the fixed inspiration repository directory. */
    imagePath: string;
    imageMediaType: InspirationImageMediaType;
    /** `builtin` is used for local records; remote records may carry a fixed URL. */
    source: 'builtin' | InspirationRemoteSource;
    sourceUrl?: string;
}
export type InspirationCatalogSource = 'builtin' | InspirationRemoteSource;
export interface InspirationCatalog {
    version: 1;
    updatedAt: number;
    source: InspirationCatalogSource;
    categories: readonly InspirationCategory[];
    styles: readonly InspirationStyle[];
    scenes: readonly InspirationScene[];
    cases: readonly InspirationCase[];
}
/** Query/filter shape consumed by `/catalog`. */
export interface InspirationFilters {
    category?: InspirationCategory;
    style?: InspirationStyle;
    scene?: InspirationScene;
    caseId?: InspirationCaseId;
    source?: 'builtin' | InspirationRemoteSource;
    /** Optional fixed source URL filter; arbitrary browser URLs are rejected. */
    sourceUrl?: string;
}
/** Built-in records keep the feature useful offline without shipping binaries. */
export declare const BUILTIN_INSPIRATION_CASES: readonly InspirationCase[];
/** Short alias for integrations that render the representative cases directly. */
export declare const INSPIRATION_CASES: readonly InspirationCase[];
/** Create the offline catalog. The returned arrays are fresh and safe to filter. */
export declare function builtinInspirationCatalog(now?: number): InspirationCatalog;
/** Compatibility alias for consumers that prefer `get*` naming. */
export declare const getBuiltinInspirationCatalog: typeof builtinInspirationCatalog;
export declare function isInspirationCaseId(value: unknown): value is InspirationCaseId;
export declare function isInspirationCategory(value: unknown): value is InspirationCategory;
export declare function isInspirationStyle(value: unknown): value is InspirationStyle;
export declare function isInspirationScene(value: unknown): value is InspirationScene;
export declare function isInspirationSource(value: unknown): value is InspirationSource;
/**
 * Parse only absolute HTTP(S) URLs without credentials, fragments, or query
 * strings. Returning a URL object avoids string-prefix parsing pitfalls.
 */
export declare function parseHttpSourceUrl(value: unknown): URL | undefined;
/**
 * Check a source URL against the fixed repository host/path allowlist. The
 * optional relative path makes the check suitable for a specific case asset.
 */
export declare function isAllowedInspirationSourceUrl(value: unknown, relativePath?: string): boolean;
/** Short aliases used by route/client integrations. */
export declare const isSafeInspirationSourceUrl: typeof isAllowedInspirationSourceUrl;
export declare const isSafeHttpSourceUrl: typeof isAllowedInspirationSourceUrl;
export declare const parseSourceUrl: typeof parseHttpSourceUrl;
export declare const parseHttpSource: typeof parseHttpSourceUrl;
/** Candidate order is intentionally mirror → jsDelivr → GitHub. */
export declare function inspirationCatalogSourceUrls(): readonly string[];
export declare function inspirationImageSourceUrls(item: InspirationCase | InspirationCaseId): readonly string[];
export declare const getInspirationImageSourceUrls: typeof inspirationImageSourceUrls;
/**
 * Validate a remote catalog while retaining only the fixed schema/case set.
 * Unknown fields are ignored; unknown case ids/categories/styles/scenes reject
 * the catalog rather than silently broadening the allowlist.
 */
export declare function parseInspirationCatalog(value: unknown): InspirationCatalog | undefined;
/** Parse URL query/record filters against the fixed category/style/scene sets. */
export declare function parseInspirationFilters(value: unknown): InspirationFilters | undefined;
export declare const parseInspirationQuery: typeof parseInspirationFilters;
export declare const parseInspirationFilter: typeof parseInspirationFilters;
/** Filter a catalog without mutating its case array. */
export declare function filterInspirationCases(cases: readonly InspirationCase[], filters?: InspirationFilters): InspirationCase[];
/** Resolve only a case from the built-in allowlist. */
export declare function getInspirationCase(caseId: unknown): InspirationCase | undefined;
/** Read a bounded HTTP response stream; never buffers beyond `maxBytes`. */
export declare function readResponseBytes(response: Response, maxBytes: number): Promise<Uint8Array>;
export declare class InspirationPayloadTooLargeError extends Error {
    readonly code = "inspiration-payload-too-large";
    readonly limit: number;
    constructor(limit: number);
}
export interface InspirationFetchResult {
    data: Uint8Array;
    url: string;
    response: Response;
}
export interface InspirationFetchOptions {
    fetch?: typeof globalThis.fetch;
    signal?: AbortSignal | undefined;
    maxBytes: number;
}
/** Fetch fixed candidates in order, rejecting redirects and oversized streams. */
export declare function fetchInspirationCandidates(urls: readonly string[], options: InspirationFetchOptions): Promise<InspirationFetchResult>;
/** Small deterministic offline preview; no binary assets are shipped. */
export declare function builtinInspirationSvg(item: InspirationCase | InspirationCaseId): string;
/** Promise-based disk cache; every filesystem error is intentionally ignored. */
export interface InspirationDiskCacheOptions {
    directory?: string;
    maxBytes?: number;
}
export declare class InspirationDiskCache {
    readonly directory: string;
    readonly maxBytes: number;
    private queue;
    constructor(options?: InspirationDiskCacheOptions);
    get(key: string): Promise<Uint8Array | undefined>;
    set(key: string, data: Uint8Array): Promise<void>;
    /** Alias for clients that use read/write terminology. */
    read(key: string): Promise<Uint8Array | undefined>;
    write(key: string, data: Uint8Array): Promise<void>;
    delete(key: string): Promise<void>;
    clear(): Promise<void>;
    private pathForKey;
    private trim;
    private enqueue;
}
export declare function createInspirationDiskCache(options?: InspirationDiskCacheOptions): InspirationDiskCache;
export {};
