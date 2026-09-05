/** CPA-backed image-generation Bundle for DeepSeek Harness. */
import type { Context } from '@deepseek-ai/cordis'
import type { AttachmentStore, ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import type {} from '@deepseek-ai/dsh-attachment'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-settings'
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
/** Cordis plugin version. */
export const version = '0.4.1'
/** Host services required by the Bundle. */
export const inject = ['tools', 'attachments', 'webServer', IMAGE_GENERATION_SERVICE]

interface GeneratedValue {
  attachment: ImageAttachmentRef
  engine: ImageEngine
  output: string
  /** Creation timestamp in milliseconds when the image was generated. */
  createdAt: number
  /** Absolute path of the workspace file copy, when the image was saved to the session workspace. */
  savedTo?: string
  /** Why the workspace file copy could not be written, when generation still succeeded. */
  saveError?: string
}

/** Map common aspect ratios to GPT-supported size dimensions. */
export function gptSizeFromAspectRatio(ratio: string | undefined): string | undefined {
  if (!ratio) return undefined
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

function toolOutputSpec() {
  return {
    schema: {
      type: 'object' as const,
      additionalProperties: false as const,
      properties: {
        attachment: {
          type: 'object' as const,
          required: true as const,
          additionalProperties: false as const,
          properties: {
            attachmentId: { type: 'string' as const, required: true as const },
            mediaType: { type: 'string' as const, required: true as const },
            bytes: { type: 'integer' as const, required: true as const },
            width: { type: 'integer' as const, required: true as const },
            height: { type: 'integer' as const, required: true as const },
            name: { type: 'string' as const },
          },
        },
        engine: { type: 'string' as const, required: true as const },
        output: { type: 'string' as const, required: true as const },
        createdAt: { type: 'integer' as const, required: true as const },
        savedTo: { type: 'string' as const },
        saveError: { type: 'string' as const },
      },
    },
    render: (_args: unknown, value: GeneratedValue) => {
      const saved =
        typeof value.savedTo === 'string'
          ? ` It was also saved to the workspace as ${value.savedTo}.`
          : typeof value.saveError === 'string'
            ? ` Saving it to the workspace failed: ${value.saveError}.`
            : ' It has no local file path.'
      return [
        {
          type: 'text' as const,
          text: `Generated one image with the ${value.engine} engine (${value.output}). It is already attached to the conversation.${saved} Respond to the user without reading or searching for the image.`,
        },
      ]
    },
    presentationMeta: (args: unknown, value: GeneratedValue) => ({
      kind: 'dsh-image-gen',
      attachment: value.attachment,
      engine: value.engine,
      output: value.output,
      createdAt: value.createdAt,
      ...(typeof value.savedTo === 'string' ? { savedTo: value.savedTo } : {}),
      prompt: (args as { prompt: string }).prompt,
    } as never),
  }
}

function createGptTool(
  imageService: CpaImageGenerationService,
  ctx: Context,
  attachments: AttachmentStore,
  currentConfig: () => Config,
) {
  return defineTool({
    name: 'generate_image',
    description:
      'Generate one image with the GPT Image engine. Use the size parameter to control framing ("1024x1792" for vertical 9:16 portrait / wallpaper, "1792x1024" for horizontal 16:9 landscape, "1024x1024" for square). Give a complete visual prompt including subject, composition, style, lighting, and any exact text that should appear. A successful image is already attached directly to the conversation; with workspace saving enabled (the default) it is also written as a file under the session workspace, and the result\'s savedTo field carries that absolute file path. Do not call read, glob, or other tools to locate or verify the image.',
    parameters: {
      prompt: { type: 'string', required: true, description: 'Complete description of the image to generate.' },
      size: {
        type: 'string',
        enum: ['1024x1024', '1024x1792', '1792x1024'],
        description:
          'Optional framing size: "1024x1024" (square), "1024x1792" (vertical 9:16 portrait / wallpaper), "1792x1024" (horizontal 16:9 landscape). Defaults to 1024x1024.',
      },
    },
    output: toolOutputSpec(),
    async execute(args, exec): Promise<GeneratedValue> {
      const active = currentConfig()
      const rawRatio = (args as { aspect_ratio?: string }).aspect_ratio
      const reqSize = args.size ?? gptSizeFromAspectRatio(rawRatio)
      const generated = await imageService.generate({
        engine: 'gpt',
        prompt: args.prompt,
        ...(reqSize === undefined ? {} : { size: reqSize }),
        signal: exec.signal,
      })
      return saveGenerated(ctx, attachments, generated, 'gpt', outputOf({ size: reqSize }), active, exec)
    },
    presentResult: (_args, result) => imagePresentation(result),
  })
}

function createGeminiTool(
  imageService: CpaImageGenerationService,
  ctx: Context,
  attachments: AttachmentStore,
  currentConfig: () => Config,
) {
  return defineTool({
    name: 'generate_image',
    description:
      'Generate one image with the Gemini Image engine. Use aspect_ratio to control composition framing (e.g. "9:16" for vertical portrait, "16:9" for landscape) and image_size for resolution tier. Give a complete visual prompt including subject, composition, style, lighting, and any exact text that should appear. A successful image is already attached directly to the conversation; with workspace saving enabled (the default) it is also written as a file under the session workspace, and the result\'s savedTo field carries that absolute file path. Do not call read, glob, or other tools to locate or verify the image.',
    parameters: {
      prompt: { type: 'string', required: true, description: 'Complete description of the image to generate.' },
      aspect_ratio: {
        type: 'string',
        enum: ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3'],
        description: 'Optional output aspect ratio (e.g. "9:16" for vertical portrait, "16:9" for landscape).',
      },
      image_size: {
        type: 'string',
        enum: ['1K', '2K', '4K'],
        description: 'Optional output resolution tier. Defaults to 1K.',
      },
    },
    output: toolOutputSpec(),
    async execute(args, exec): Promise<GeneratedValue> {
      const active = currentConfig()
      const rawSize = (args as { size?: string }).size
      const generated = await imageService.generate({
        engine: 'gemini',
        prompt: args.prompt,
        ...(args.aspect_ratio === undefined ? {} : { aspectRatio: args.aspect_ratio }),
        ...(args.image_size === undefined ? {} : { imageSize: args.image_size }),
        ...(rawSize === undefined ? {} : { size: rawSize }),
        signal: exec.signal,
      })
      return saveGenerated(
        ctx,
        attachments,
        generated,
        'gemini',
        outputOf({ aspect_ratio: args.aspect_ratio, image_size: args.image_size, size: rawSize }),
        active,
        exec,
      )
    },
    presentResult: (_args, result) => imagePresentation(result),
  })
}

/** Define specialized tool parameters, descriptions, and adapters by engine. */
export function toolDefinitionForEngine(
  engine: ImageEngine,
  imageService: CpaImageGenerationService,
  ctx: Context,
  attachments: AttachmentStore,
  currentConfig: () => Config,
) {
  return engine === 'gemini'
    ? createGeminiTool(imageService, ctx, attachments, currentConfig)
    : createGptTool(imageService, ctx, attachments, currentConfig)
}

/** Register settings, the image route, and the model-callable tool. */
export function apply(ctx: Context, config: Config = {}): void {
  let current: () => Config = () => config
  let activeEngine: ImageEngine = config.engine ?? 'gpt'
  let cachedService: CpaImageGenerationService | undefined
  let toolDisposer: (() => void) | undefined
  const attachments = (ctx as Context & { attachments: AttachmentStore }).attachments

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact', path: IMAGE_ROUTE,
    handler: (req, res) => serveImage(req, res, { readImage: ref => attachments.readImage(ref) }),
  }), 'dsh-image-gen: image route')

  function syncTool(engine: ImageEngine) {
    if (cachedService === undefined) return
    toolDisposer?.()
    activeEngine = engine
    const toolDef = toolDefinitionForEngine(engine, cachedService, ctx, attachments, () => current())
    toolDisposer = ctx.tools.register(toolDef)
  }

  ctx.inject(['settings'], scope => {
    scope.settings.installSection(ctx, IMAGE_GENERATION_NAMESPACE, Config, config, {
      setSource: source => {
        current = source
        syncTool(source().engine ?? 'gpt')
      },
      onChange: () => {
        syncTool(current().engine ?? 'gpt')
      },
    })
  })

  ctx.inject([IMAGE_GENERATION_SERVICE], imageCtx => {
    cachedService = imageCtx.get(IMAGE_GENERATION_SERVICE) as CpaImageGenerationService
    syncTool(activeEngine)
  })

  ctx.effect(() => () => {
    toolDisposer?.()
    toolDisposer = undefined
  }, 'dsh-image-gen: active tool cleanup')
}

/**
 * Persist the generated image as a durable attachment, then — when workspace
 * saving is enabled — also write it as a file under the calling agent's
 * session workspace. A workspace write failure never discards the generated
 * attachment: it is reported through `saveError` instead.
 */
async function saveGenerated(
  ctx: Context,
  attachments: AttachmentStore,
  generated: { data: Uint8Array; mediaType: ImageAttachmentRef['mediaType'] },
  engine: ImageEngine,
  output: string,
  config: Config,
  exec: { agent?: { session: { header: { cwd?: string } } }; signal: AbortSignal },
): Promise<GeneratedValue> {
  if (!attachments.imageLimits.mediaTypes.includes(generated.mediaType)) throw new Error(`This DSH deployment does not accept ${generated.mediaType} generated images`)
  const attachment = await attachments.saveImage({ data: generated.data, mediaType: generated.mediaType, name: 'generated-image' })
  const value: GeneratedValue = { attachment, engine, output, createdAt: Math.floor(Date.now() / 1000) * 1000 }
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

function outputOf(args: { aspect_ratio?: string | undefined; image_size?: string | undefined; size?: string | undefined }): string {
  return [args.aspect_ratio, args.image_size, args.size].filter((value): value is string => value !== undefined).join(', ')
}
