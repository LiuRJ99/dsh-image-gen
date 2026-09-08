/** Browser image bytes are capped independently of the catalog metadata. */
export declare const MAX_INSPIRATION_IMAGE_CACHE_BYTES: number;
export declare const DEFAULT_INSPIRATION_IMAGE_CACHE_MAX_BYTES: number;
export declare const INSPIRATION_IMAGE_CACHE_DB = "dsh_image_gen_inspiration_images_v1-ff0a9d45e2f2903fe987cf476cda95d38d500e05";
export declare const INSPIRATION_IMAGE_CACHE_STORE = "images";
/** Same-origin image route; keep this module browser-safe (no node imports). */
export declare const INSPIRATION_IMAGE_ROUTE = "/plugins/dsh-image-gen/inspiration/image";
export interface InspirationImageCacheEntry {
    id: string;
    blob: Blob;
    bytes: number;
    mediaType: string;
    savedAt: number;
    lastAccessedAt: number;
}
export interface InspirationImageCacheOptions {
    dbName?: string;
    storeName?: string;
    maxBytes?: number;
    now?: () => number;
}
/**
 * Store image blobs under case ids only. Arbitrary URL keys are rejected before
 * they can affect IndexedDB, and all storage/quota errors are swallowed.
 */
export declare class InspirationImageCache {
    readonly dbName: string;
    readonly storeName: string;
    readonly maxBytes: number;
    private readonly now;
    private mutationQueue;
    constructor(options?: InspirationImageCacheOptions);
    get(id: string): Promise<Blob | undefined>;
    getEntry(id: string): Promise<InspirationImageCacheEntry | undefined>;
    put(id: string, image: Blob | Uint8Array, mediaType?: string): Promise<boolean>;
    delete(id: string): Promise<void>;
    clear(): Promise<void>;
    /** Return the currently persisted byte count, or zero when IDB is absent. */
    sizeBytes(): Promise<number>;
    private touch;
    private enqueueMutation;
}
export declare function getInspirationImageCache(options?: InspirationImageCacheOptions): InspirationImageCache;
export declare function getCachedInspirationImage(id: string): Promise<Blob | undefined>;
export declare function cacheInspirationImage(id: string, image: Blob | Uint8Array, mediaType?: string): Promise<boolean>;
export declare function clearInspirationImageCache(): Promise<void>;
/** Read an image response without buffering beyond the shared cache limit. */
export declare function readBoundedImageBlob(response: Response, maxBytes?: number): Promise<Blob>;
export interface FetchInspirationImageOptions {
    cache?: InspirationImageCache;
    fetch?: typeof globalThis.fetch;
    signal?: AbortSignal;
    forceRefresh?: boolean;
}
/**
 * Cache-first browser image loader. It accepts a case id only and constructs a
 * same-origin URL; callers cannot redirect it to a user-supplied image host.
 */
export declare function fetchInspirationImage(id: string, options?: FetchInspirationImageOptions): Promise<Blob | undefined>;
export declare const loadInspirationImage: typeof fetchInspirationImage;
export declare function resetInspirationImageCacheForTests(): void;
