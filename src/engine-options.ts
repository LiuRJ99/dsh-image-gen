/** CPA-only image engine option normalization shared by Host routes and tools. */

/** GPT Image sizes accepted by the CPA image service. */
export const GPT_IMAGE_SIZES = ['1024x1024', '1024x1792', '1792x1024'] as const
export type GptImageSize = typeof GPT_IMAGE_SIZES[number]

/** Gemini Image aspect ratios accepted by the CPA image service. */
export const GEMINI_ASPECT_RATIOS = ['1:1', '3:2', '2:3', '4:3', '3:4', '16:9', '9:16'] as const
export type GeminiAspectRatio = typeof GEMINI_ASPECT_RATIOS[number]

/** Gemini Image resolution tiers accepted by the CPA image service. */
export const GEMINI_IMAGE_SIZES = ['1K', '2K', '4K'] as const
export type GeminiImageSize = typeof GEMINI_IMAGE_SIZES[number]

/** Map common aspect ratios to the three GPT Image framing dimensions. */
export function gptSizeFromAspectRatio(ratio: string | undefined): GptImageSize | undefined {
  if (typeof ratio !== 'string') return undefined
  switch (ratio.trim()) {
    case '9:16':
    case '2:3':
    case '3:4':
      return '1024x1792'
    case '16:9':
    case '3:2':
    case '4:3':
      return '1792x1024'
    case '1:1':
      return '1024x1024'
    default:
      return undefined
  }
}

/** Keep a GPT size only when it is one of the declared CPA options. */
export function normalizeGptSize(value: unknown): GptImageSize | undefined {
  return typeof value === 'string' && (GPT_IMAGE_SIZES as readonly string[]).includes(value.trim())
    ? value.trim() as GptImageSize
    : undefined
}

/** Keep a Gemini aspect ratio only when it is one of the declared CPA options. */
export function normalizeGeminiAspectRatio(value: unknown): GeminiAspectRatio | undefined {
  return typeof value === 'string' && (GEMINI_ASPECT_RATIOS as readonly string[]).includes(value.trim())
    ? value.trim() as GeminiAspectRatio
    : undefined
}

/** Keep a Gemini resolution tier only when it is one of the declared CPA options. */
export function normalizeGeminiImageSize(value: unknown): GeminiImageSize | undefined {
  return typeof value === 'string' && (GEMINI_IMAGE_SIZES as readonly string[]).includes(value.trim())
    ? value.trim() as GeminiImageSize
    : undefined
}

/** Human-readable metadata for a CPA request without claiming native provider state. */
export function outputLabel(options: {
  engine: 'gpt' | 'gemini'
  size?: string | undefined
  aspectRatio?: string | undefined
  imageSize?: string | undefined
}): string {
  if (options.engine === 'gpt') return options.size ?? '1024x1024'
  return [options.aspectRatio, options.imageSize].filter((value): value is string => value !== undefined).join(', ')
}
