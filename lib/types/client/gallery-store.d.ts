/**
 * Lightweight IndexedDB persistence layer for Image Generation Gallery.
 * Stores lightweight metadata indexes; image binaries remain managed by DSH Attachment service.
 * Supports tombstones to ensure deleted items are never resurrected when revisiting conversations.
 */
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment';
import type { ImageEngine } from '../shared.js';
export type GalleryEngine = ImageEngine | 'unknown';
/** IndexedDB schema version retained by the fork; optional fields are schemaless. */
export declare const GALLERY_DB_VERSION = 3;
/** Sort modes exposed by the gallery toolbar (persisted to localStorage). */
export type SortOption = 'time-desc' | 'time-asc' | 'prompt-asc' | 'prompt-desc' | 'size-desc';
/** Layout modes the gallery can render (persisted to localStorage). */
export type ViewMode = 'grid' | 'list' | 'table';
/** Selectable aspect-ratio buckets for the ratio filter. */
export type AspectRatioFilter = 'all' | '1:1' | '16:9' | '9:16' | '4:3' | '3:4' | '3:2' | '2:3';
/** Ordered sort options for the toolbar dropdown. */
export declare const SORT_OPTIONS: readonly SortOption[];
/** Ordered ratio buckets for the toolbar dropdown. */
export declare const ASPECT_RATIO_FILTERS: readonly AspectRatioFilter[];
export interface GalleryItem {
    id: string;
    attachment: ImageAttachmentRef;
    prompt: string;
    engine: GalleryEngine;
    model: string;
    createdAt: number;
    aspectRatio?: string;
    imageSize?: string;
    output?: string;
    /** Persisted user favorite; optional for DB v3 records written by older builds. */
    isFavorite?: boolean;
    /** Optional user labels, retained across automatic gallery re-indexing. */
    tags?: string[];
    /** Workspace metadata used only for filtering and safe file cleanup. */
    workspacePath?: string;
    workspaceId?: string;
    sessionId?: string;
    /** Absolute path returned by the safe host workspace save, when present. */
    savedTo?: string;
    /** Stable workspace-save diagnostic when generation itself succeeded. */
    saveError?: string;
    /** Retained only when a legacy record cannot be mapped to an engine. */
    legacyProvider?: string;
    /** Retained only when a record contains an unsupported engine value. */
    legacyEngine?: string;
    /** Diagnostic for records that cannot be mapped without guessing. */
    normalizationError?: string;
}
/**
 * Input accepted by the pure metadata normalizer. The required GalleryItem
 * fields are intentionally optional so legacy metadata-only records can be
 * normalized without constructing browser or Attachment state in tests.
 */
export type GalleryItemInput = Partial<Omit<GalleryItem, 'engine' | 'model' | 'legacyProvider' | 'legacyEngine' | 'normalizationError' | 'createdAt'>> & {
    createdAt?: number | undefined;
    engine?: unknown;
    model?: unknown;
    provider?: unknown;
    legacyProvider?: unknown;
    legacyEngine?: unknown;
    normalizationError?: unknown;
};
/** Display label for a normalized engine, including an explicit unknown case. */
export declare function galleryEngineLabel(engine: GalleryEngine): string;
/** Canonical aspect-ratio bucket for a gallery item, or `undefined` when unknown. */
export declare function extractAspectRatio(item: GalleryItem): AspectRatioFilter;
/** Format an image resolution, e.g. `1024×1024`, or an empty string when unknown. */
export declare function formatResolution(item: GalleryItem): string;
/** Human-readable file size, e.g. `1.4 MB` / `340 KB` / `12 B`. */
export declare function formatBytes(bytes: number | undefined | null): string;
/** Formatted creation time, e.g. `2025-05-18 14:30:45`. */
export declare function formatDate(timestamp: number, lang?: 'zh' | 'en'): string;
/** Compare two gallery items with a deterministic locale and id tie-breaker. */
export declare function compareGalleryItems(a: GalleryItem, b: GalleryItem, sortOption: SortOption): number;
/** Memoizable filter + sort pipeline over the raw gallery list. */
export declare function processGalleryItems(items: readonly GalleryItem[], options: {
    search: string;
    selectedEngine: string;
    selectedRatio: AspectRatioFilter;
    sortOption: SortOption;
}): GalleryItem[];
/** Count of gallery items for one engine bucket (`all` counts everything). */
export declare function countByEngine(items: readonly GalleryItem[], engine: string): number;
/**
 * Normalize current and legacy Gallery metadata without inferring unknown
 * providers. Legacy OpenAI/Google records are mapped to the CPA engines;
 * unsupported values remain visible as an explicit unknown record.
 */
export declare function normalizeGalleryItem(item: GalleryItemInput): GalleryItem;
type GalleryListener = () => void;
/**
 * Subscribe to gallery mutations (insert/delete/clear).
 */
export declare function subscribeGallery(listener: GalleryListener): () => void;
/**
 * Save or update a gallery record by attachmentId.
 * Skipped if the item was previously deleted (tombstoned). Existing user
 * metadata (favorite, tags and workspace path) survives automatic re-indexing.
 */
export declare function saveGalleryItem(item: Omit<GalleryItem, 'createdAt'> & {
    createdAt?: number | undefined;
}): Promise<void>;
/**
 * Retrieve all gallery records sorted by createdAt descending. Reading the
 * object store rather than only the index keeps legacy rows without a timestamp
 * visible; malformed rows are quarantined from the returned list.
 */
export declare function getGalleryItems(): Promise<GalleryItem[]>;
/** Toggle the persisted favorite flag and return the new state. */
export declare function toggleFavoriteGalleryItem(id: string): Promise<boolean | undefined>;
/** Delete multiple gallery records and write tombstones in one transaction. */
export declare function bulkDeleteGalleryItems(ids: readonly string[]): Promise<void>;
/** Delete a single gallery record by ID and record a tombstone. */
export declare function deleteGalleryItem(id: string): Promise<boolean>;
/** Clear all gallery records and reset tombstones after commit succeeds. */
export declare function clearGallery(): Promise<void>;
/** Normalize path separators and case for cross-platform workspace matching. */
export declare function normalizeWorkspacePath(rawPath: string): string;
/** Determine whether an item belongs to a workspace using stable metadata or its saved path. */
export declare function isItemInWorkspace(item: GalleryItem, workspace?: {
    workspaceId?: string;
    path?: string;
    sessionIds?: readonly string[];
} | null): boolean;
export {};
