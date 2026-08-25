/** Values shared by the Host and browser Bundle faces. */
import type { ImageEngine } from '@LiuRJ99/dsh-cpa-plugin/image-generation'

export type { ImageEngine } from '@LiuRJ99/dsh-cpa-plugin/image-generation'

/** Browser route used by the generated-image card. */
export const IMAGE_ROUTE = '/plugins/dsh-image-gen/image'
/** Namespace persisted through DSH Settings. */
export const IMAGE_GENERATION_NAMESPACE = 'image-generation'

/** Engines exposed by the CPA image-generation service. */
export const IMAGE_ENGINES = ['gpt', 'gemini'] as const satisfies readonly ImageEngine[]
