/** CPA-backed image-generation Bundle for DeepSeek Harness. */
import type { Context } from '@deepseek-ai/cordis'
import type { AttachmentStore, ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import type {} from '@deepseek-ai/dsh-attachment'
import type {} from '@deepseek-ai/dsh-host-webserver'
import * as dshSettings from '@deepseek-ai/dsh-settings'
import { defineTool, type ToolResult } from '@deepseek-ai/dsh-tools'
import {
  IMAGE_GENERATION_SERVICE,
  type CpaImageGenerationService,
  type ImageEngine,
} from '@LiuRJ99/dsh-cpa-plugin/image-generation'
import { Config } from './config.js'
import { normalizeGeminiAspectRatio, normalizeGeminiImageSize, normalizeGptSize, outputLabel, gptSizeFromAspectRatio } from './engine-options.js'
import { serveCpaGenerate } from './cpa-generate-route.js'
import { serveInspirationRoute } from './inspiration-route.js'
import { IMAGE_ROUTE, imageAttachmentFromMeta, serveDelete, serveImage, serveWorkspaces } from './image-route.js'
import { CPA_GENERATE_ROUTE, DELETE_ROUTE, IMAGE_GENERATION_NAMESPACE, INSPIRATION_ROUTE, WORKSPACES_ROUTE, attachmentMeta } from './shared.js'
import { deleteImageFromWorkspace, getDshWorkspaceRoots, getDshWorkspacesFull, saveImageToWorkspace } from './workspace-save.js'

export { gptSizeFromAspectRatio } from './engine-options.js'

export { Config } from './config.js'
export { CPA_GENERATE_ROUTE } from './cpa-generate-route.js'
export { DELETE_ROUTE, IMAGE_ROUTE, INSPIRATION_ROUTE, WORKSPACES_ROUTE, imageAttachmentFromMeta } from './shared.js'

/** Cordis plugin name. */
export const name = 'dsh-image-gen'
/** Cordis plugin version. */
export const version = '0.5.0'
/** Host services required by the Bundle. */
export const inject = ['tools', 'attachments', 'webServer']

interface GeneratedValue {
  attachment: ImageAttachmentRef
  engine: ImageEngine
  output: string
  /** The normalized engine-specific aspect ratio, when Gemini received one. */
  aspectRatio?: string
  /** The normalized engine-specific image-size tier, when Gemini received one. */
  imageSize?: string
  /** Creation timestamp in milliseconds when the image was generated. */
  createdAt: number
  /** Absolute path of the workspace file copy, when the image was saved to the session workspace. */
  savedTo?: string
  /** Why the workspace file copy could not be written, when generation still succeeded. */
  saveError?: string
}

const SUPPORTED_IMAGE_MEDIA_TYPES = new Set<ImageAttachmentRef['mediaType']>([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
])
const MAX_PROMPT_LENGTH = 16_000

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
            originalDimensions: {
              type: 'object' as const,
              additionalProperties: false as const,
              properties: {
                width: { type: 'integer' as const, required: true as const },
                height: { type: 'integer' as const, required: true as const },
              },
            },
          },
        },
        engine: { type: 'string' as const, required: true as const },
        output: { type: 'string' as const, required: true as const },
        aspectRatio: { type: 'string' as const },
        imageSize: { type: 'string' as const },
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
        {
          type: 'image' as const,
          attachment: value.attachment,
        },
      ]
    },
    presentationMeta: (args: unknown, value: GeneratedValue) => ({
      kind: 'dsh-image-gen',
      attachment: attachmentMeta(value.attachment),
      engine: value.engine,
      output: value.output,
      ...(typeof value.aspectRatio === 'string' ? { aspectRatio: value.aspectRatio } : {}),
      ...(typeof value.imageSize === 'string' ? { imageSize: value.imageSize } : {}),
      createdAt: value.createdAt,
      ...(typeof value.savedTo === 'string' ? { savedTo: value.savedTo } : {}),
      ...(typeof value.saveError === 'string' ? { saveError: value.saveError } : {}),
      prompt: (args as { prompt: string }).prompt,
    } as never),
  }
}

function createGptTool(
  imageService: CpaImageGenerationService,
  ctx: Context,
  attachments: AttachmentStore,
  currentConfig: () => Config,
  knownWorkspaceRoots: Set<string>,
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
      const prompt = checkedPrompt(args.prompt)
      const active = currentConfig()
      // Older callers sometimes still send aspect_ratio. It is an adapter-only
      // compatibility input: map it to GPT size, never forward it to CPA.
      const rawRatio = (args as { aspect_ratio?: unknown }).aspect_ratio
      const reqSize = normalizeGptSize(args.size) ?? gptSizeFromAspectRatio(typeof rawRatio === 'string' ? rawRatio : undefined) ?? '1024x1024'
      exec.signal.throwIfAborted()
      const generated = await imageService.generate({
        engine: 'gpt',
        prompt,
        size: reqSize,
        signal: exec.signal,
      })
      return saveGenerated(ctx, attachments, generated, 'gpt', outputLabel({ engine: 'gpt', size: reqSize }), active, exec, {}, knownWorkspaceRoots)
    },
    presentResult: (_args, result) => imagePresentation(result),
  })
}

function createGeminiTool(
  imageService: CpaImageGenerationService,
  ctx: Context,
  attachments: AttachmentStore,
  currentConfig: () => Config,
  knownWorkspaceRoots: Set<string>,
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
      const prompt = checkedPrompt(args.prompt)
      const active = currentConfig()
      // Only Gemini's declared image_config fields enter the CPA request.
      // A legacy generic `size` value is deliberately ignored rather than
      // leaking an OpenAI-only option into the Gemini route.
      const aspectRatio = normalizeGeminiAspectRatio(args.aspect_ratio)
      const imageSize = normalizeGeminiImageSize(args.image_size)
      exec.signal.throwIfAborted()
      const generated = await imageService.generate({
        engine: 'gemini',
        prompt,
        ...(aspectRatio === undefined ? {} : { aspectRatio }),
        ...(imageSize === undefined ? {} : { imageSize }),
        signal: exec.signal,
      })
      return saveGenerated(
        ctx,
        attachments,
        generated,
        'gemini',
        outputLabel({ engine: 'gemini', aspectRatio, imageSize }),
        active,
        exec,
        { aspectRatio, imageSize },
        knownWorkspaceRoots,
      )
    },
    presentResult: (_args, result) => imagePresentation(result),
  })
}

function checkedPrompt(value: string): string {
  const prompt = value.trim()
  if (prompt.length === 0 || prompt.length > MAX_PROMPT_LENGTH) throw new Error('prompt-invalid')
  return prompt
}

/** Define specialized tool parameters, descriptions, and adapters by engine. */
export function toolDefinitionForEngine(
  engine: ImageEngine,
  imageService: CpaImageGenerationService,
  ctx: Context,
  attachments: AttachmentStore,
  currentConfig: () => Config,
  knownWorkspaceRoots = new Set<string>(),
) {
  if (engine !== 'gpt' && engine !== 'gemini') throw new Error(`Unsupported CPA image engine: ${String(engine)}`)
  return engine === 'gemini'
    ? createGeminiTool(imageService, ctx, attachments, currentConfig, knownWorkspaceRoots)
    : createGptTool(imageService, ctx, attachments, currentConfig, knownWorkspaceRoots)
}

/** Register settings, the image route, and the model-callable tool. */
export function apply(ctx: Context, config: Config = {}): void {
  let current: () => Config = () => config
  let activeEngine: ImageEngine = config.engine ?? 'gpt'
  let cachedService: CpaImageGenerationService | undefined
  let toolDisposer: (() => void) | undefined
  const knownWorkspaceRoots = new Set<string>()
  const attachments = (ctx as Context & { attachments: AttachmentStore }).attachments

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact', path: IMAGE_ROUTE,
    handler: (req, res) => serveImage(req, res, { readImage: (ref, signal) => attachments.readImage(ref, signal) }),
  }), 'dsh-image-gen: image route')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact', path: CPA_GENERATE_ROUTE,
    handler: (req, res) => serveCpaGenerate(req, res, {
      getService: () => cachedService,
      saveImage: input => attachments.saveImage(input),
      readImage: (ref, signal) => attachments.readImage(ref, signal),
      // A browser request has no trusted agent/session cwd. Keep regeneration
      // attachment-only; normal tool calls remain the sole workspace writer.
      getWorkspaceOptions: () => ({ enabled: false }),
      getAllowedWorkspaceRoots: allowedWorkspaceRoots,
      saveToWorkspace: options => {
        if (options.workspaceRoot.length <= 4096 && knownWorkspaceRoots.size < 256) knownWorkspaceRoots.add(options.workspaceRoot)
        return saveImageToWorkspace(options)
      },
      maxImageBytes: attachments.imageLimits.maxImageBytes,
      mediaTypes: attachments.imageLimits.mediaTypes,
    }),
  }), 'dsh-image-gen: CPA generation route')

  const allowedWorkspaceRoots = async (): Promise<Set<string>> => {
    const discovered = await getDshWorkspaceRoots().catch(() => [])
    return new Set([...knownWorkspaceRoots, ...discovered])
  }

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact', path: DELETE_ROUTE,
    handler: (req, res) => serveDelete(req, res, {
      deleteWorkspaceImage: async (filePath, options) => deleteImageFromWorkspace(filePath, await allowedWorkspaceRoots(), options),
    }),
  }), 'dsh-image-gen: workspace image delete route')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact', path: WORKSPACES_ROUTE,
    handler: (req, res) => serveWorkspaces(req, res, { getWorkspaces: getDshWorkspacesFull }),
  }), 'dsh-image-gen: workspace discovery route')

  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix', path: INSPIRATION_ROUTE,
    handler: (req, res) => serveInspirationRoute(req, res),
  }), 'dsh-image-gen: inspiration route')

  let warnedServiceUnavailable = false
  function syncTool(engine: ImageEngine) {
    if (cachedService === undefined) {
      if (!warnedServiceUnavailable) {
        warnedServiceUnavailable = true
        ctx.logger.warn('dsh-image-gen: CPA image generation service is unavailable; generate_image is not registered')
      }
      return
    }
    toolDisposer?.()
    activeEngine = engine
    const toolDef = toolDefinitionForEngine(engine, cachedService, ctx, attachments, () => current(), knownWorkspaceRoots)
    toolDisposer = ctx.tools.register(toolDef)
  }

  installImageSettings(ctx, config, {
    setSource: source => {
      current = source
      syncTool(source().engine ?? 'gpt')
    },
    onChange: () => {
      syncTool(current().engine ?? 'gpt')
    },
  })

  // The service is optional at Bundle startup so routes can return a stable
  // 503 and the missing-service diagnostic remains observable. The dynamic
  // inject below registers the tool as soon as the Provider becomes ready.
  syncTool(activeEngine)
  ctx.inject([IMAGE_GENERATION_SERVICE], imageCtx => {
    const service = imageCtx.get(IMAGE_GENERATION_SERVICE) as CpaImageGenerationService | undefined
    if (service === undefined || typeof service.generate !== 'function') {
      cachedService = undefined
      syncTool(activeEngine)
      return
    }
    cachedService = service
    warnedServiceUnavailable = false
    syncTool(activeEngine)
    ctx.effect(() => () => {
      if (cachedService !== service) return
      cachedService = undefined
      toolDisposer?.()
      toolDisposer = undefined
      syncTool(activeEngine)
    }, 'dsh-image-gen: CPA service lifecycle cleanup')
  })

  ctx.effect(() => () => {
    toolDisposer?.()
    toolDisposer = undefined
    knownWorkspaceRoots.clear()
  }, 'dsh-image-gen: active tool cleanup')
}

/**
 * Persist the generated image as a durable attachment, then — when workspace
 * saving is enabled — also write it as a file under the calling agent's
 * session workspace. A workspace write failure never discards the generated
 * attachment: it is reported through `saveError` instead.
 */
interface GeneratedMetadata {
  aspectRatio?: string | undefined
  imageSize?: string | undefined
}

/** Validate a CPA response before it reaches Attachment or workspace storage. */
export function assertGeneratedImage(
  value: unknown,
  limits: { maxImageBytes: number; mediaTypes: readonly string[] },
): asserts value is { data: Uint8Array; mediaType: ImageAttachmentRef['mediaType'] } {
  if (typeof value !== 'object' || value === null) throw new Error('CPA image service returned an invalid image result')
  const result = value as { data?: unknown; mediaType?: unknown }
  if (!(result.data instanceof Uint8Array) || result.data.byteLength === 0) {
    throw new Error('CPA image service returned empty image data')
  }
  if (!Number.isFinite(limits.maxImageBytes) || result.data.byteLength > limits.maxImageBytes) {
    throw new Error('CPA image service returned an image larger than the DSH attachment limit')
  }
  if (typeof result.mediaType !== 'string' || !SUPPORTED_IMAGE_MEDIA_TYPES.has(result.mediaType as ImageAttachmentRef['mediaType']) || !limits.mediaTypes.includes(result.mediaType)) {
    throw new Error(`This DSH deployment does not accept ${String(result.mediaType)} generated images`)
  }
}

async function saveGenerated(
  ctx: Context,
  attachments: AttachmentStore,
  generated: unknown,
  engine: ImageEngine,
  output: string,
  config: Config,
  exec: { agent?: { session: { header: { cwd?: string } } }; signal: AbortSignal },
  metadata: GeneratedMetadata = {},
  knownWorkspaceRoots = new Set<string>(),
): Promise<GeneratedValue> {
  assertGeneratedImage(generated, attachments.imageLimits)
  exec.signal.throwIfAborted()
  const attachment = await attachments.saveImage({ data: generated.data, mediaType: generated.mediaType, name: 'generated-image' })
  exec.signal.throwIfAborted()
  const value: GeneratedValue = {
    attachment,
    engine,
    output,
    ...(metadata.aspectRatio === undefined ? {} : { aspectRatio: metadata.aspectRatio }),
    ...(metadata.imageSize === undefined ? {} : { imageSize: metadata.imageSize }),
    createdAt: Math.floor(Date.now() / 1000) * 1000,
  }
  if (config.saveToWorkspace === false) return value
  const workspaceRoot = exec.agent?.session.header.cwd
  if (workspaceRoot === undefined) return value
  if (workspaceRoot.length <= 4096 && knownWorkspaceRoots.size < 256) knownWorkspaceRoots.add(workspaceRoot)
  try {
    // AttachmentStore may normalize/re-encode the image before returning the
    // durable ref. Read the stored bytes back so workspace output and the
    // attachment always describe the same content and media type.
    const stored = await attachments.readImage(attachment, exec.signal)
    value.savedTo = await saveImageToWorkspace({
      workspaceRoot,
      folder: config.workspaceFolder,
      attachmentId: stored.ref.attachmentId,
      mediaType: stored.ref.mediaType,
      data: stored.data,
      signal: exec.signal,
    })
  } catch (error) {
    // A cancellation is never reported as a (partial) success: rethrow it even
    // if the workspace write had already finished when the signal fired.
    exec.signal.throwIfAborted()
    ctx.logger.warn(`dsh-image-gen: failed to save image to workspace: ${error instanceof Error ? error.message : String(error)}`)
    value.saveError = 'workspace-save-failed'
  }
  return value
}

function imagePresentation(result: ToolResult) {
  const attachment = imageAttachmentFromMeta(result.meta)
  return attachment === undefined ? undefined : { card: 'generic' as const, title: 'Generated image', content: [{ type: 'image' as const, attachment }] }
}

/** Settings hooks shared by modern DSH settings and older relay hosts. */
interface SettingsHooks {
  setSource(source: () => Config): void
  onChange(): void
}

interface LegacySettingsApi {
  installSettingsSection?: (ctx: Context, namespace: unknown, schema: unknown, entry: unknown, hooks: SettingsHooks) => void
  settingsNamespace?: (value: string) => unknown
}

/**
 * Keep the fork compatible with both the 0.1.2 settings service and the older
 * top-level relay without changing the CPA-only configuration surface. The
 * fallback is deliberately best-effort: tools still register if settings are
 * unavailable, and no credential/provider fields are added to Config.
 */
function installImageSettings(ctx: Context, config: Config, hooks: SettingsHooks): void {
  const namespace = dshSettings as typeof dshSettings & LegacySettingsApi
  const modernInstall = namespace.SettingsProvider?.prototype?.installSection
  if (typeof modernInstall === 'function') {
    ctx.inject(['settings'], settingsCtx => {
      settingsCtx.settings.installSection(ctx, IMAGE_GENERATION_NAMESPACE, Config, config, hooks)
    })
    return
  }
  if (typeof namespace.installSettingsSection === 'function' && typeof namespace.settingsNamespace === 'function') {
    namespace.installSettingsSection(ctx, namespace.settingsNamespace(IMAGE_GENERATION_NAMESPACE), Config, config, hooks)
    return
  }
  ctx.logger.warn('dsh-image-gen: neither settings API generation is available; using composition defaults')
}
