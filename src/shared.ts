/** Values shared by the Host and browser Bundle faces. */
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import type { ImageEngine } from '@LiuRJ99/dsh-cpa-plugin/image-generation'

export type { ImageEngine } from '@LiuRJ99/dsh-cpa-plugin/image-generation'

/** Browser route used by the generated-image card. */
export const IMAGE_ROUTE = '/plugins/dsh-image-gen/image'
/** Same-origin route used by Gallery regeneration and Inspiration actions. */
export const CPA_GENERATE_ROUTE = '/plugins/dsh-image-gen/generate'
/** Same-origin read-only route exposing discovered workspace metadata. */
export const WORKSPACES_ROUTE = '/plugins/dsh-image-gen/workspaces'
/** Same-origin route used by Gallery batch cleanup for generated files only. */
export const DELETE_ROUTE = '/plugins/dsh-image-gen/delete'
/** Same-origin prefix for the provider-neutral Inspiration Library. */
export const INSPIRATION_ROUTE = '/plugins/dsh-image-gen/inspiration'
/** Full immutable snapshot ref used by remote Inspiration refresh and cache keys. */
export const INSPIRATION_SOURCE_REF = 'ff0a9d45e2f2903fe987cf476cda95d38d500e05'
export const INSPIRATION_CACHE_NAMESPACE = `v1-${INSPIRATION_SOURCE_REF}`
/** Namespace persisted through DSH Settings. */
export const IMAGE_GENERATION_NAMESPACE = 'image-generation'

/** Engines exposed by the CPA image-generation service. */
export const IMAGE_ENGINES = ['gpt', 'gemini'] as const satisfies readonly ImageEngine[]

/**
 * Validate the persisted reference carried by a tool presentation.
 * Shared between host and browser so request/event body extraction stays unified.
 */
export function imageAttachmentFromMeta(meta: unknown): ImageAttachmentRef | undefined {
  const value = record(meta)
  if (value?.kind !== 'dsh-image-gen') return undefined
  return imageAttachment(value.attachment)
}

export function imageAttachment(value: unknown): ImageAttachmentRef | undefined {
  const ref = record(value)
  if (ref === undefined) return undefined
  if (typeof ref.attachmentId !== 'string' || ref.attachmentId.trim() === '' || ref.attachmentId.length > 256 || !mediaType(ref.mediaType) || !finiteIntegerNonNegative(ref.bytes) || !finiteIntegerPositive(ref.width) || !finiteIntegerPositive(ref.height)) return undefined
  if (ref.name !== undefined && (typeof ref.name !== 'string' || ref.name.length > 256 || /[\\/\u0000-\u001f\u007f]/u.test(ref.name))) return undefined
  if (ref.originalDimensions !== undefined) {
    const dimensions = record(ref.originalDimensions)
    if (dimensions === undefined || !finiteIntegerPositive(dimensions.width) || !finiteIntegerPositive(dimensions.height)) return undefined
  }
  return ref as unknown as ImageAttachmentRef
}

/** JSON-safe attachment metadata for DSH result/presentation compatibility. */
export function attachmentMeta(ref: ImageAttachmentRef): Record<string, unknown> {
  return {
    attachmentId: String(ref.attachmentId),
    mediaType: ref.mediaType,
    bytes: ref.bytes,
    width: ref.width,
    height: ref.height,
    ...(ref.name === undefined ? {} : { name: ref.name }),
    ...(ref.originalDimensions === undefined ? {} : {
      originalDimensions: {
        width: ref.originalDimensions.width,
        height: ref.originalDimensions.height,
      },
    }),
  }
}

export function mediaType(value: unknown): value is ImageAttachmentRef['mediaType'] {
  return value === 'image/png' || value === 'image/jpeg' || value === 'image/webp' || value === 'image/gif'
}

export function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

function finiteIntegerNonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function finiteIntegerPositive(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}
