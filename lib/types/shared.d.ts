/** Values shared by the Host and browser Bundle faces. */
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment';
export type { ImageEngine } from '@LiuRJ99/dsh-cpa-plugin/image-generation';
/** Browser route used by the generated-image card. */
export declare const IMAGE_ROUTE = "/plugins/dsh-image-gen/image";
/** Same-origin route used by Gallery regeneration and Inspiration actions. */
export declare const CPA_GENERATE_ROUTE = "/plugins/dsh-image-gen/generate";
/** Same-origin read-only route exposing discovered workspace metadata. */
export declare const WORKSPACES_ROUTE = "/plugins/dsh-image-gen/workspaces";
/** Same-origin route used by Gallery batch cleanup for generated files only. */
export declare const DELETE_ROUTE = "/plugins/dsh-image-gen/delete";
/** Same-origin prefix for the provider-neutral Inspiration Library. */
export declare const INSPIRATION_ROUTE = "/plugins/dsh-image-gen/inspiration";
/** Full immutable snapshot ref used by remote Inspiration refresh and cache keys. */
export declare const INSPIRATION_SOURCE_REF = "ff0a9d45e2f2903fe987cf476cda95d38d500e05";
export declare const INSPIRATION_CACHE_NAMESPACE = "v1-ff0a9d45e2f2903fe987cf476cda95d38d500e05";
/** Namespace persisted through DSH Settings. */
export declare const IMAGE_GENERATION_NAMESPACE = "image-generation";
/** Engines exposed by the CPA image-generation service. */
export declare const IMAGE_ENGINES: readonly ["gpt", "gemini"];
/**
 * Validate the persisted reference carried by a tool presentation.
 * Shared between host and browser so request/event body extraction stays unified.
 */
export declare function imageAttachmentFromMeta(meta: unknown): ImageAttachmentRef | undefined;
export declare function imageAttachment(value: unknown): ImageAttachmentRef | undefined;
/** JSON-safe attachment metadata for DSH result/presentation compatibility. */
export declare function attachmentMeta(ref: ImageAttachmentRef): Record<string, unknown>;
export declare function mediaType(value: unknown): value is ImageAttachmentRef['mediaType'];
export declare function record(value: unknown): Record<string, unknown> | undefined;
