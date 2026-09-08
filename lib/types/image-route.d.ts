/** Same-origin HTTP bridge from the Web result card to the Attachment service. */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ImageAttachmentRef, StoredImageAttachment } from '@deepseek-ai/dsh-attachment';
export { IMAGE_ROUTE, imageAttachmentFromMeta } from './shared.js';
/** Default thumbnail width in pixels when the browser asks for a thumbnail. */
export declare const DEFAULT_THUMB_WIDTH = 300;
/** Thumbnail encode quality (0–100) for the WebP output. */
export declare const THUMB_QUALITY = 70;
/** Upper bound a client may request for a thumbnail width; larger requests are clamped. */
export declare const MAX_THUMB_WIDTH = 1024;
/** Short private cache window for the full-resolution response (seconds). */
export declare const FULL_CACHE_MAX_AGE = 300;
/** Long immutable cache window for content-addressed thumbnails (seconds). */
export declare const THUMB_CACHE_MAX_AGE = 604800;
/** What the browser wants from the route. Defaults to the full image. */
export type ImageRequestKind = 'full' | 'thumb';
/** Dependencies required by the image route. */
export interface ImageRouteDeps {
    readImage(ref: ImageAttachmentRef, signal?: AbortSignal): Promise<StoredImageAttachment>;
}
/** Parsed route request body (post JSON parsing + validation). */
export interface ImageRequest {
    attachment: ImageAttachmentRef;
    kind: ImageRequestKind;
    thumbWidth: number;
}
/** Serve one verified durable image reference to a same-origin browser request. */
export declare function serveImage(req: IncomingMessage, res: ServerResponse, deps: ImageRouteDeps): Promise<void>;
/**
 * Decode a stored image and produce a downscaled WebP thumbnail. GIFs are
 * flattened to their first frame (sharp has no animated output here), and the
 * image is never upscaled beyond its intrinsic size.
 */
export declare function renderThumbnail(stored: StoredImageAttachment, width: number): Promise<Buffer>;
/** Clamp a requested thumbnail width into the supported 1..MAX_THUMB_WIDTH range. */
export declare function clampThumbWidth(width: number): number;
/** Dependencies for the provider-independent Gallery cleanup route. */
export interface DeleteRouteDeps {
    deleteWorkspaceImage(filePath: string, options?: {
        hashBudget?: {
            remaining: number;
        };
    }): Promise<boolean>;
}
/** Dependencies for the read-only workspace discovery route. */
export interface WorkspacesRouteDeps {
    getWorkspaces(): Promise<unknown> | unknown;
}
/** Delete only explicitly selected generated files; this route never writes files. */
export declare function serveDelete(req: IncomingMessage, res: ServerResponse, deps: DeleteRouteDeps): Promise<void>;
/** Return discovered workspace metadata without exposing credentials or settings. */
export declare function serveWorkspaces(req: IncomingMessage, res: ServerResponse, deps: WorkspacesRouteDeps): Promise<void>;
