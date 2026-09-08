import type { ImageAttachmentRef, ImageMediaType, StoredImageAttachment } from '@deepseek-ai/dsh-attachment';
/** Provider-neutral image bytes passed to the CPA edit contract. */
export interface ResolvedReferenceImage {
    data: Uint8Array;
    mediaType: ImageMediaType;
}
/** Small structural session surface used by the edit tool. */
export interface ReferenceImageAgent {
    session: {
        deriveMessages(): readonly unknown[];
        header?: {
            cwd?: string;
        };
    };
}
/** Small structural attachment surface used by the edit tool. */
export interface ReferenceImageStore {
    readImage(ref: ImageAttachmentRef, signal?: AbortSignal): Promise<StoredImageAttachment>;
}
/** Resolve one or more references in caller order or latest-user upload order. */
export declare function resolveReferenceImages(input: {
    agent?: ReferenceImageAgent;
    attachments: ReferenceImageStore;
    sourceAttachmentId?: string;
    sourceAttachmentIds?: readonly string[];
    sourcePath?: string;
    sourcePaths?: readonly string[];
    maxBytes?: number;
    signal: AbortSignal;
}): Promise<ResolvedReferenceImage[]>;
/** Backwards-friendly single-reference helper for callers that need one image. */
export declare function resolveReferenceImage(input: Parameters<typeof resolveReferenceImages>[0]): Promise<ResolvedReferenceImage>;
/** Find explicit references in caller order, or all images from the newest user upload. */
export declare function findReferenceImages(messages: readonly unknown[], sourceAttachmentIds?: readonly string[]): ImageAttachmentRef[];
/** Find one matching image recursively through message and tool-result content. */
export declare function findReferenceImage(messages: readonly unknown[], sourceAttachmentId?: string): ImageAttachmentRef | undefined;
