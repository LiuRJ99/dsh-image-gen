import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment';
/** What to request from the image route. */
export type ImageKind = 'full' | 'thumb';
/** Default thumbnail width shared with the server-side clamp. */
export declare const DEFAULT_THUMB_WIDTH = 300;
export interface GalleryImageState {
    url: string | undefined;
    blob: Blob | undefined;
    loading: boolean;
    error: string | undefined;
}
/** Build the POST body the image route expects (kept in one place). */
export declare function buildImageRequestBody(ref: ImageAttachmentRef, kind: ImageKind, thumbWidth: number): string;
/**
 * Load one gallery image and keep its object URL alive only while the calling
 * component is mounted. Pass `kind: 'thumb'` for card/list/table thumbnails and
 * `kind: 'full'` for the lightbox.
 */
export declare function useGalleryImage(ref: ImageAttachmentRef, kind?: ImageKind, thumbWidth?: number): GalleryImageState;
