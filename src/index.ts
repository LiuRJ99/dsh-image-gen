/** CPA-backed image-generation Bundle for DeepSeek Harness. */
import type { Context } from '@deepseek-ai/cordis'
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import { defineTool, type ToolResult } from '@deepseek-ai/dsh-tools'
import {
  IMAGE_GENERATION_SERVICE,
  type CpaImageGenerationService,
  type ImageEngine,
} from '@LiuRJ99/dsh-cpa-plugin/image-generation'
import { Config } from './config.js'
import { IMAGE_ROUTE, imageAttachmentFromMeta, serveImage } from './image-route.js'
import { IMAGE_GENERATION_NAMESPACE } from './shared.js'
import { saveImageToWorkspace } from './workspace-save.js'

export { Config } from './config.js'
export { IMAGE_ROUTE, imageAttachmentFromMeta } from './image-route.js'

/** Cordis plugin name. */
export const name = 'dsh-image-gen'
/** Host services required by the Bundle. */
export const inject = ['tools', 'attachments', 'webServer', IMAGE_GENERATION_SERVICE]

interface GeneratedValue {
  attachment: ImageAttachmentRef
  engine: ImageEngine
  output: string
  /** Absolute path of the workspace file copy, when the image was saved to the session workspace. */
  savedTo?: string
  /** Why the workspace file copy could not be written, when generation still succeeded. */
  saveError?: string
}

/** Register settings, the image route, and the model-callable tool. */
export function apply(ctx: Context, config: Config = {}): void {
  let current: () => Config = () => config
  installSettingsSection(ctx, settingsNamespace(IMAGE_GENERATION_NAMESPACE), Config, config, {
    setSource: source => { current = source }, onChange: () => {},
  })
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact', path: IMAGE_ROUTE,
    handler: (req, res) => serveImage(req, res, { readImage: ref => ctx.attachments.readImage(ref) }),
  }), 'dsh-image-gen: image route')

  ctx.inject([IMAGE_GENERATION_SERVICE], imageCtx => {
    const imageService = imageCtx.get(IMAGE_GENERATION_SERVICE) as CpaImageGenerationService
    ctx.tools.register(defineTool({
      name: 'generate_image',
      description: 'Generate one image with the configured image engine. Use when the user explicitly asks to create or draw an image. Give a complete visual prompt including subject, composition, style, lighting, and any exact text that should appear. A successful image is already attached directly to the conversation; with workspace saving enabled (the default) it is also written as a file under the session workspace, and the result\'s savedTo field carries that absolute file path. Do not call read, glob, or other tools to locate or verify the image.',
      parameters: {
        prompt: { type: 'string', required: true, description: 'Complete description of the image to generate.' },
        aspect_ratio: { type: 'string', enum: ['1:1', '3:2', '2:3', '4:3', '3:4', '16:9', '9:16'], description: 'Optional output aspect ratio.' },
        image_size: { type: 'string', enum: ['1K', '2K', '4K'], description: 'Optional output resolution.' },
        size: { type: 'string', description: 'Optional dimensions or size tier forwarded to CPA.' },
      },
      output: {
        schema: {
          type: 'object', additionalProperties: false, properties: {
            attachment: { type: 'object', required: true, additionalProperties: false, properties: {
              attachmentId: { type: 'string', required: true }, mediaType: { type: 'string', required: true }, bytes: { type: 'integer', required: true }, width: { type: 'integer', required: true }, height: { type: 'integer', required: true }, name: { type: 'string' },
            } },
            engine: { type: 'string', required: true }, output: { type: 'string', required: true },
            savedTo: { type: 'string' }, saveError: { type: 'string' },
          },
        },
        render: (_args, value) => {
          const saved = typeof value.savedTo === 'string' ? ` It was also saved to the workspace as ${value.savedTo}.` : typeof value.saveError === 'string' ? ` Saving it to the workspace failed: ${value.saveError}.` : ' It has no local file path.'
          return [{ type: 'text', text: `Generated one image with the ${value.engine} engine (${value.output}). It is already attached to the conversation.${saved} Respond to the user without reading or searching for the image.` }]
        },
        presentationMeta: (args, value) => ({
          kind: 'dsh-image-gen',
          attachment: value.attachment,
          engine: value.engine,
          output: value.output,
          ...(typeof value.savedTo === 'string' ? { savedTo: value.savedTo } : {}),
          prompt: (args as { prompt: string }).prompt,
        }),
      },
      async execute(args, exec): Promise<GeneratedValue> {
        const active = current()
        const engine = active.engine ?? 'gpt'
        const generated = await imageService.generate({
          engine,
          prompt: args.prompt,
          ...(args.aspect_ratio === undefined ? {} : { aspectRatio: args.aspect_ratio }),
          ...(args.image_size === undefined ? {} : { imageSize: args.image_size }),
          ...(args.size === undefined ? {} : { size: args.size }),
          signal: exec.signal,
        })
        return saveGenerated(ctx, generated, engine, outputOf(args), active, exec)
      },
      presentResult: (_args, result) => imagePresentation(result),
    }))
  })
}

/**
 * Persist the generated image as a durable attachment, then — when workspace
 * saving is enabled — also write it as a file under the calling agent's
 * session workspace. A workspace write failure never discards the generated
 * attachment: it is reported through `saveError` instead.
 */
async function saveGenerated(
  ctx: Context,
  generated: { data: Uint8Array; mediaType: ImageAttachmentRef['mediaType'] },
  engine: ImageEngine,
  output: string,
  config: Config,
  exec: { agent?: { session: { header: { cwd?: string } } }; signal: AbortSignal },
): Promise<GeneratedValue> {
  if (!ctx.attachments.imageLimits.mediaTypes.includes(generated.mediaType)) throw new Error(`This DSH deployment does not accept ${generated.mediaType} generated images`)
  const attachment = await ctx.attachments.saveImage({ data: generated.data, mediaType: generated.mediaType, name: 'generated-image' })
  const value: GeneratedValue = { attachment, engine, output }
  if (config.saveToWorkspace === false) return value
  const workspaceRoot = exec.agent?.session.header.cwd
  if (workspaceRoot === undefined) return value
  try {
    value.savedTo = await saveImageToWorkspace({
      workspaceRoot,
      folder: config.workspaceFolder,
      attachmentId: attachment.attachmentId,
      mediaType: generated.mediaType,
      data: generated.data,
      signal: exec.signal,
    })
  } catch (error) {
    // A cancellation is never reported as a (partial) success: rethrow it even
    // if the workspace write had already finished when the signal fired.
    exec.signal.throwIfAborted()
    ctx.logger.warn(`dsh-image-gen: failed to save image to workspace: ${error instanceof Error ? error.message : String(error)}`)
    value.saveError = error instanceof Error ? error.message : String(error)
  }
  return value
}

function imagePresentation(result: ToolResult) {
  const attachment = imageAttachmentFromMeta(result.meta)
  return attachment === undefined ? undefined : { card: 'generic' as const, title: 'Generated image', content: [{ type: 'image' as const, attachment }] }
}

function outputOf(args: { aspect_ratio?: string; image_size?: string; size?: string }): string {
  return [args.aspect_ratio, args.image_size, args.size].filter((value): value is string => value !== undefined).join(', ')
}
