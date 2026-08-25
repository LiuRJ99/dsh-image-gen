/** User-facing configuration for CPA-backed image generation. */
import z from '@deepseek-ai/schemastery'
import { IMAGE_ENGINES, type ImageEngine } from './shared.js'

export { IMAGE_ENGINES, type ImageEngine } from './shared.js'

/** Default workspace subfolder that receives generated image files. */
export const DEFAULT_WORKSPACE_FOLDER = 'dsh-image-gen'

/** Tool-level output controls shared by both CPA engines. */
export const ASPECT_RATIOS = ['1:1', '3:2', '2:3', '4:3', '3:4', '16:9', '9:16'] as const
export const IMAGE_SIZES = ['1K', '2K', '4K'] as const
export type AspectRatio = typeof ASPECT_RATIOS[number]
export type ImageSize = typeof IMAGE_SIZES[number]

/** Bundle configuration from the profile patch and the Web settings page. */
export interface Config {
  engine?: ImageEngine
  /** Also write every generated image as a file under the session workspace. */
  saveToWorkspace?: boolean
  /** Workspace subfolder for generated images; empty means the workspace root. */
  workspaceFolder?: string
}

/** Cordis configuration schema. */
export const Config: z<Config> = z.object({
  engine: z.union(IMAGE_ENGINES).default('gpt'),
  saveToWorkspace: z.boolean().default(true),
  workspaceFolder: z.string().default(DEFAULT_WORKSPACE_FOLDER),
})
