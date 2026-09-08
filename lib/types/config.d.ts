/** User-facing configuration for CPA-backed image generation. */
import z from '@deepseek-ai/schemastery';
import { type ImageEngine } from './shared.js';
export { IMAGE_ENGINES, type ImageEngine } from './shared.js';
/** Default workspace subfolder that receives generated image files. */
export declare const DEFAULT_WORKSPACE_FOLDER = "dsh-image-gen";
/** Tool-level output controls shared by both CPA engines. */
export declare const ASPECT_RATIOS: readonly ["1:1", "3:2", "2:3", "4:3", "3:4", "16:9", "9:16"];
export declare const IMAGE_SIZES: readonly ["1K", "2K", "4K"];
export type AspectRatio = typeof ASPECT_RATIOS[number];
export type ImageSize = typeof IMAGE_SIZES[number];
/** Bundle configuration from the profile patch and the Web settings page. */
export interface Config {
    engine?: ImageEngine;
    /** Also write every generated image as a file under the session workspace. */
    saveToWorkspace?: boolean;
    /** Workspace subfolder for generated images; empty means the workspace root. */
    workspaceFolder?: string;
}
/**
 * Keep the schema as an object for DSH serialization/rendering, while using
 * schemastery's public strict resolver to drop legacy and unknown fields.
 */
export declare const Config: z<Config>;
