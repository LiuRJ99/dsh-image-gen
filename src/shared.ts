/** Values shared by the Host and browser Bundle faces. */
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import type { ImageEngine } from '@LiuRJ99/dsh-cpa-plugin/image-generation'

export type { ImageEngine } from '@LiuRJ99/dsh-cpa-plugin/image-generation'

/** Browser route used by the generated-image card. */
export const IMAGE_ROUTE = '/plugins/dsh-image-gen/image'
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
  if (typeof ref.attachmentId !== 'string' || !mediaType(ref.mediaType) || typeof ref.bytes !== 'number' || typeof ref.width !== 'number' || typeof ref.height !== 'number') return undefined
  if (ref.name !== undefined && typeof ref.name !== 'string') return undefined
  return ref as unknown as ImageAttachmentRef
}

export function mediaType(value: unknown): value is ImageAttachmentRef['mediaType'] {
  return value === 'image/png' || value === 'image/jpeg' || value === 'image/webp' || value === 'image/gif'
}

export function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}
