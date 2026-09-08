/** CPA-backed image-generation Bundle for DeepSeek Harness. */
import type { Context } from '@deepseek-ai/cordis';
import type { AttachmentStore, ImageAttachmentRef } from '@deepseek-ai/dsh-attachment';
import { type CpaImageGenerationService, type ImageEngine } from '@LiuRJ99/dsh-cpa-plugin/image-generation';
import { Config } from './config.js';
export { gptSizeFromAspectRatio } from './engine-options.js';
export { Config } from './config.js';
export { CPA_GENERATE_ROUTE } from './cpa-generate-route.js';
export { DELETE_ROUTE, IMAGE_ROUTE, INSPIRATION_ROUTE, WORKSPACES_ROUTE, imageAttachmentFromMeta } from './shared.js';
/** Cordis plugin name. */
export declare const name = "dsh-image-gen";
/** Cordis plugin version. */
export declare const version = "0.5.0";
/** Host services required by the Bundle. */
export declare const inject: string[];
/** Define specialized tool parameters, descriptions, and adapters by engine. */
export declare function toolDefinitionForEngine(engine: ImageEngine, imageService: CpaImageGenerationService, ctx: Context, attachments: AttachmentStore, currentConfig: () => Config, knownWorkspaceRoots?: Set<string>): import("@deepseek-ai/dsh-tools").ToolDefinition;
export declare function editToolDefinitionForEngine(engine: ImageEngine, imageService: CpaImageGenerationService, ctx: Context, attachments: AttachmentStore, currentConfig: () => Config, knownWorkspaceRoots?: Set<string>): import("@deepseek-ai/dsh-tools").ToolDefinition;
/** Register settings, the image route, and the model-callable tool. */
export declare function apply(ctx: Context, config?: Config): void;
/** Validate a CPA response before it reaches Attachment or workspace storage. */
export declare function assertGeneratedImage(value: unknown, limits: {
    maxImageBytes: number;
    mediaTypes: readonly string[];
}): asserts value is {
    data: Uint8Array;
    mediaType: ImageAttachmentRef['mediaType'];
};
