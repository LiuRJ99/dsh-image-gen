/** CPA-only image engine option normalization shared by Host routes and tools. */
/** GPT Image sizes accepted by the CPA image service. */
export declare const GPT_IMAGE_SIZES: readonly ["1024x1024", "1024x1792", "1792x1024"];
export type GptImageSize = typeof GPT_IMAGE_SIZES[number];
/** Gemini Image aspect ratios accepted by the CPA image service. */
export declare const GEMINI_ASPECT_RATIOS: readonly ["1:1", "3:2", "2:3", "4:3", "3:4", "16:9", "9:16"];
export type GeminiAspectRatio = typeof GEMINI_ASPECT_RATIOS[number];
/** Gemini Image resolution tiers accepted by the CPA image service. */
export declare const GEMINI_IMAGE_SIZES: readonly ["1K", "2K", "4K"];
export type GeminiImageSize = typeof GEMINI_IMAGE_SIZES[number];
/** Map common aspect ratios to the three GPT Image framing dimensions. */
export declare function gptSizeFromAspectRatio(ratio: string | undefined): GptImageSize | undefined;
/** Keep a GPT size only when it is one of the declared CPA options. */
export declare function normalizeGptSize(value: unknown): GptImageSize | undefined;
/** Keep a Gemini aspect ratio only when it is one of the declared CPA options. */
export declare function normalizeGeminiAspectRatio(value: unknown): GeminiAspectRatio | undefined;
/** Keep a Gemini resolution tier only when it is one of the declared CPA options. */
export declare function normalizeGeminiImageSize(value: unknown): GeminiImageSize | undefined;
/** Human-readable metadata for a CPA request without claiming native provider state. */
export declare function outputLabel(options: {
    engine: 'gpt' | 'gemini';
    size?: string | undefined;
    aspectRatio?: string | undefined;
    imageSize?: string | undefined;
}): string;
