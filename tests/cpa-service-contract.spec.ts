import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IMAGE_GENERATION_SERVICE, type CpaImageGenerationService } from '../src/cpa-contract.js'
import { apply, CPA_GENERATE_ROUTE, editToolDefinitionForEngine, inject, name, version, gptSizeFromAspectRatio, toolDefinitionForEngine } from '../src/index.js'

vi.mock('@deepseek-ai/dsh-tools', () => ({
  defineTool: (tool: unknown) => tool,
}))

interface RegisteredTool {
  parameters?: Record<string, unknown>
  description?: string
  output?: { schema?: Record<string, unknown>; render?: (args: unknown, value: unknown) => unknown }
  execute(args: Record<string, unknown>, exec: { signal: AbortSignal; agent?: unknown }): Promise<Record<string, unknown>>
}

const attachment: ImageAttachmentRef = {
  attachmentId: 'sha256:0123456789abcdef',
  mediaType: 'image/png',
  bytes: 3,
  width: 1,
  height: 1,
  name: 'generated-image',
}

describe('CPA image service contract', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('exports plugin metadata', () => {
    expect(name).toBe('dsh-image-gen')
    expect(version).toBe('0.5.0')
  })

  it('declares and uses the injected service without resolving credentials', async () => {
    const signal = new AbortController().signal
    const generate = vi.fn<CpaImageGenerationService['generate']>().mockResolvedValue({
      data: new Uint8Array([1, 2, 3]),
      mediaType: 'image/png',
    })
    const edit = vi.fn<NonNullable<CpaImageGenerationService['edit']>>().mockResolvedValue({
      data: new Uint8Array([1, 2, 3]),
      mediaType: 'image/png',
    })
    const imageService: CpaImageGenerationService = { generate, edit }
    const tools = { register: vi.fn() }
    const ctx = {
      tools,
      attachments: {
        imageLimits: { maxImageBytes: 1024, mediaTypes: ['image/png'] },
        saveImage: vi.fn().mockResolvedValue(attachment),
      },
      webServer: { register: vi.fn() },
      logger: { warn: vi.fn() },
      effect: vi.fn((effect: () => unknown) => effect()),
      inject: vi.fn((deps: string[], callback: (scope: { get(name: string): unknown }) => unknown) => {
        if (deps[0] === 'settings') return undefined
        expect(deps).toEqual([IMAGE_GENERATION_SERVICE])
        return callback({ get: name => name === IMAGE_GENERATION_SERVICE ? imageService : undefined })
      }),
    }

    expect(inject).not.toContain(IMAGE_GENERATION_SERVICE)
    expect(inject).toContain('webServer')
    expect(inject).not.toContain('credentials')
    apply(ctx as never, { engine: 'gemini', saveToWorkspace: false })

    const tool = tools.register.mock.calls[0]?.[0] as RegisteredTool | undefined
    expect(tool).toBeDefined()
    expect(tools.register).toHaveBeenCalledTimes(2)
    expect(tools.register.mock.calls[1]?.[0]).toMatchObject({ name: 'edit_image' })
    const result = await tool!.execute({
      prompt: 'a blue circle',
      aspect_ratio: '16:9',
      image_size: '2K',
      size: '1536x864',
    }, { signal })

    // `size` is an OpenAI-style option and must not leak into the Gemini CPA
    // image_config request. Gemini receives only its declared controls.
    expect(generate).toHaveBeenCalledWith({
      engine: 'gemini',
      prompt: 'a blue circle',
      aspectRatio: '16:9',
      imageSize: '2K',
      signal,
    })
    expect(result).toMatchObject({ attachment, engine: 'gemini' })
    expect(tool.output?.schema).toMatchObject({ properties: { attachment: { properties: { originalDimensions: expect.any(Object) } } } })
    expect(tool.output?.render?.({}, result)).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'text' }),
      expect.objectContaining({ type: 'image', attachment }),
    ]))
  })

  it('keeps routes observable and emits a warning when CPA is not loaded yet', () => {
    const tools = { register: vi.fn() }
    const webServer = { register: vi.fn(() => () => undefined) }
    const warn = vi.fn()
    const ctx = {
      tools,
      webServer,
      attachments: {
        imageLimits: { maxImageBytes: 1024, mediaTypes: ['image/png'] },
        saveImage: vi.fn(),
        readImage: vi.fn(),
      },
      logger: { warn },
      effect: vi.fn((effect: () => unknown) => effect()),
      inject: vi.fn(() => undefined),
    }
    apply(ctx as never, { engine: 'gpt', saveToWorkspace: false })
    expect(tools.register).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('CPA image generation service is unavailable'))
    expect(webServer.register.mock.calls.map(([definition]) => (definition as { path?: string }).path)).toContain(CPA_GENERATE_ROUTE)
  })

  it('creates specialized GPT tool declaration and auto-adapts aspect_ratio to size', async () => {
    const signal = new AbortController().signal
    const generate = vi.fn<CpaImageGenerationService['generate']>().mockResolvedValue({
      data: new Uint8Array([1, 2, 3]),
      mediaType: 'image/png',
    })
    const imageService: CpaImageGenerationService = { generate }
    const attachments = {
      imageLimits: { maxImageBytes: 1024, mediaTypes: ['image/png'] },
      saveImage: vi.fn().mockResolvedValue(attachment),
    }

    const gptTool = toolDefinitionForEngine('gpt', imageService, {} as never, attachments as never, () => ({ saveToWorkspace: false })) as unknown as RegisteredTool
    expect(gptTool.parameters).toHaveProperty('prompt')
    expect(gptTool.parameters).toHaveProperty('size')
    expect(gptTool.parameters).not.toHaveProperty('aspect_ratio')
    expect(gptTool.parameters).not.toHaveProperty('image_size')

    // Execute with aspect_ratio: auto-normalized to size="1024x1792" without forwarding aspectRatio to CPA
    await gptTool.execute({
      prompt: 'vertical cat',
      aspect_ratio: '9:16',
    }, { signal })

    expect(generate).toHaveBeenCalledWith({
      engine: 'gpt',
      prompt: 'vertical cat',
      size: '1024x1792',
      signal,
    })
  })

  it('rejects empty or oversized prompts before calling CPA', async () => {
    const generate = vi.fn<CpaImageGenerationService['generate']>()
    const attachments = {
      imageLimits: { maxImageBytes: 1024, mediaTypes: ['image/png'] },
      saveImage: vi.fn().mockResolvedValue(attachment),
    }
    const gptTool = toolDefinitionForEngine('gpt', { generate }, {} as never, attachments as never, () => ({ saveToWorkspace: false })) as unknown as RegisteredTool
    await expect(gptTool.execute({ prompt: 'x'.repeat(16_001) }, { signal: new AbortController().signal })).rejects.toThrow('prompt-invalid')
    expect(generate).not.toHaveBeenCalled()
  })

  it('forwards the configured CPA model and retains the resolved model metadata', async () => {
    const signal = new AbortController().signal
    const generate = vi.fn<CpaImageGenerationService['generate']>().mockResolvedValue({
      data: new Uint8Array([1, 2, 3]),
      mediaType: 'image/png',
      model: 'gpt-image-2.5',
    })
    const attachments = {
      imageLimits: { maxImageBytes: 1024, mediaTypes: ['image/png'] },
      saveImage: vi.fn().mockResolvedValue(attachment),
    }
    const tool = toolDefinitionForEngine(
      'gpt',
      { generate },
      {} as never,
      attachments as never,
      () => ({ engine: 'gpt', model: 'gpt-image-2.5', saveToWorkspace: false }),
    ) as unknown as RegisteredTool

    const result = await tool.execute({ prompt: 'future model' }, { signal })
    expect(generate).toHaveBeenCalledWith({
      engine: 'gpt',
      model: 'gpt-image-2.5',
      prompt: 'future model',
      size: '1024x1024',
      signal,
    })
    expect(result).toMatchObject({ engine: 'gpt', model: 'gpt-image-2.5' })
  })

  it('creates specialized Gemini tool declaration', () => {
    const generate = vi.fn<CpaImageGenerationService['generate']>()
    const imageService: CpaImageGenerationService = { generate }
    const attachments = {
      imageLimits: { maxImageBytes: 1024, mediaTypes: ['image/png'] },
      saveImage: vi.fn().mockResolvedValue(attachment),
    }

    const geminiTool = toolDefinitionForEngine('gemini', imageService, {} as never, attachments as never, () => ({ saveToWorkspace: false })) as unknown as RegisteredTool
    expect(geminiTool.parameters).toHaveProperty('prompt')
    expect(geminiTool.parameters).toHaveProperty('aspect_ratio')
    expect(geminiTool.parameters).toHaveProperty('image_size')
    expect(geminiTool.parameters).not.toHaveProperty('size')
  })

  it('registers edit_image only when CPA edit is available and resolves inline references', async () => {
    const signal = new AbortController().signal
    const edit = vi.fn<CpaImageGenerationService['edit']>().mockResolvedValue({
      data: new Uint8Array([1, 2, 3]),
      mediaType: 'image/png',
    })
    const source = { ...attachment, attachmentId: 'sha256:' + 'a'.repeat(64), bytes: 3 }
    const attachments = {
      imageLimits: { maxImageBytes: 1024, mediaTypes: ['image/png'] },
      saveImage: vi.fn().mockResolvedValue(attachment),
      readImage: vi.fn().mockResolvedValue({ ref: source, data: new Uint8Array([9, 8, 7]) }),
    }
    const imageService: CpaImageGenerationService = { generate: vi.fn(), edit }
    const editTool = editToolDefinitionForEngine('gpt', imageService, {} as never, attachments as never, () => ({ saveToWorkspace: false })) as unknown as RegisteredTool

    expect(editTool.parameters).toHaveProperty('source_attachment_ids')
    expect(editTool.parameters).toHaveProperty('source_paths')
    await editTool.execute({ prompt: 'replace the outfit' }, {
      signal,
      agent: {
        session: {
          deriveMessages: () => [{ source: { kind: 'user' }, content: [{ type: 'image', attachment: source }] }],
        },
      },
    })

    expect(edit).toHaveBeenCalledWith({
      engine: 'gpt',
      prompt: 'replace the outfit',
      referenceImages: [{ data: new Uint8Array([9, 8, 7]), mediaType: 'image/png' }],
      size: '1024x1024',
      signal,
    })
  })

  it('keeps edit_image unavailable when an older CPA service has no edit method', async () => {
    const imageService: CpaImageGenerationService = { generate: vi.fn() }
    const attachments = {
      imageLimits: { maxImageBytes: 1024, mediaTypes: ['image/png'] },
      saveImage: vi.fn().mockResolvedValue(attachment),
    }
    const editTool = editToolDefinitionForEngine('gpt', imageService, {} as never, attachments as never, () => ({ saveToWorkspace: false })) as unknown as RegisteredTool
    expect(editTool.description).toContain('edit_image')
    await expect(editTool.execute({ prompt: 'edit' }, { signal: new AbortController().signal })).rejects.toThrow('image-editing-unavailable')
  })

  it('maps aspect ratios to standard GPT size strings', () => {
    expect(gptSizeFromAspectRatio('9:16')).toBe('1024x1792')
    expect(gptSizeFromAspectRatio('16:9')).toBe('1792x1024')
    expect(gptSizeFromAspectRatio('1:1')).toBe('1024x1024')
    expect(gptSizeFromAspectRatio('2:3')).toBe('1024x1792')
    expect(gptSizeFromAspectRatio('3:2')).toBe('1792x1024')
    expect(gptSizeFromAspectRatio(undefined)).toBeUndefined()
  })
})
