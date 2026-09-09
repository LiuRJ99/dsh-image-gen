/** Stable Cordis service token provided by the CPA Provider. */
export const IMAGE_GENERATION_SERVICE = 'dshCpaImageGeneration'

/** The protocol families understood by the Adapter. */
export type ImageEngine = 'gpt' | 'gemini'

export type CpaImageMediaType = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'

/** Browser-safe image model metadata projected by a compatible CPA Provider. */
export interface CpaImageModel {
  id: string
  name: string
  aliases?: readonly string[]
  engine: ImageEngine
  supportsGenerate: boolean
  supportsEdit?: boolean
}

/** Provider-neutral image bytes resolved by the DSH Host. */
export interface CpaReferenceImage {
  data: Uint8Array
  mediaType: CpaImageMediaType
}

/** Backward-compatible request shape; `model` is optional for older Providers. */
export interface CpaImageGenerationRequest {
  engine: ImageEngine
  model?: string
  prompt: string
  aspectRatio?: string
  imageSize?: string
  size?: string
  signal: AbortSignal
}

/** Backward-compatible edit request shape; `model` is optional for older Providers. */
export interface CpaImageEditRequest {
  engine: ImageEngine
  model?: string
  prompt: string
  referenceImages: readonly CpaReferenceImage[]
  aspectRatio?: string
  imageSize?: string
  size?: string
  signal: AbortSignal
}

/** Backward-compatible result shape; newer Providers may report the resolved model. */
export interface CpaGeneratedImage {
  data: Uint8Array
  mediaType: CpaImageMediaType
  model?: string
}

/**
 * Structural compatibility seam for CPA 0.4.x and newer Providers.
 * The Adapter feature-detects `listModels` and `edit` at runtime, so its source
 * build must not require optional type exports or transitive Provider packages.
 */
export interface CpaImageGenerationService {
  generate(request: CpaImageGenerationRequest): Promise<CpaGeneratedImage>
  listModels?(signal?: AbortSignal): Promise<readonly CpaImageModel[]>
  edit?(request: CpaImageEditRequest): Promise<CpaGeneratedImage>
}
