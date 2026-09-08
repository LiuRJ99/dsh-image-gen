/** Small, failure-tolerant IndexedDB cache for the Inspiration catalog. */
import type { InspirationCatalog } from '../inspiration.js';
/** Catalog metadata is intentionally capped well below browser quota limits. */
export declare const MAX_INSPIRATION_CATALOG_CACHE_BYTES: number;
export declare const DEFAULT_INSPIRATION_CATALOG_CACHE_MAX_BYTES: number;
export declare const INSPIRATION_CATALOG_CACHE_DB = "dsh_image_gen_inspiration_v1-ff0a9d45e2f2903fe987cf476cda95d38d500e05";
export declare const INSPIRATION_CATALOG_CACHE_STORE = "catalog";
/** Same-origin route constants are duplicated here to keep the browser bundle free of node imports. */
export declare const INSPIRATION_CATALOG_ROUTE = "/plugins/dsh-image-gen/inspiration/catalog";
export declare const INSPIRATION_REFRESH_ROUTE = "/plugins/dsh-image-gen/inspiration/refresh";
export interface InspirationCatalogCacheOptions {
    dbName?: string;
    storeName?: string;
    maxBytes?: number;
    now?: () => number;
}
/**
 * Persist one validated catalog. All browser storage errors are swallowed so a
 * private-mode/quota failure never prevents gallery UI from using the network.
 */
export declare class InspirationCatalogCache {
    readonly dbName: string;
    readonly storeName: string;
    readonly maxBytes: number;
    private readonly now;
    private mutationQueue;
    constructor(options?: InspirationCatalogCacheOptions);
    get(): Promise<InspirationCatalog | undefined>;
    put(catalog: InspirationCatalog): Promise<boolean>;
    clear(): Promise<void>;
    /** Alias useful to cache-owning clients. */
    delete(): Promise<void>;
    private safe;
    private enqueueMutation;
}
export declare function getInspirationCatalogCache(options?: InspirationCatalogCacheOptions): InspirationCatalogCache;
export declare function getCachedInspirationCatalog(): Promise<InspirationCatalog | undefined>;
export declare function cacheInspirationCatalog(catalog: InspirationCatalog): Promise<boolean>;
export declare function clearInspirationCatalogCache(): Promise<void>;
export interface FetchInspirationCatalogOptions {
    cache?: InspirationCatalogCache;
    fetch?: typeof globalThis.fetch;
    signal?: AbortSignal;
    forceRefresh?: boolean;
    query?: string;
}
/**
 * Cache-first browser loader for the same-origin catalog route. A failed
 * refresh falls back to the last valid IndexedDB value, then returns undefined.
 */
export declare function fetchInspirationCatalog(options?: FetchInspirationCatalogOptions): Promise<InspirationCatalog | undefined>;
export declare function readBoundedCatalogBytes(response: Response, maxBytes?: number): Promise<Uint8Array>;
export declare function refreshInspirationCatalog(options?: Omit<FetchInspirationCatalogOptions, 'forceRefresh'>): Promise<InspirationCatalog | undefined>;
export declare const loadInspirationCatalog: typeof fetchInspirationCatalog;
/** Reset in-memory connection state; primarily useful after a test closes IDB. */
export declare function resetInspirationCatalogCacheForTests(): void;
