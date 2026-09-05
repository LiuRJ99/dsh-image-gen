import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IMAGE_GENERATION_SERVICE, type CpaImageGenerationService } from '@LiuRJ99/dsh-cpa-plugin/image-generation'
import { apply, inject, name, version, gptSizeFromAspectRatio, toolDefinitionForEngine } from '../src/index.js'

vi.mock('@deepseek-ai/dsh-tools', () => ({
  defineTool: (tool: unknown) => tool,
}))

interface RegisteredTool {
  parameters?: Record<string, unknown>
  description?: string
  execute(args: Record<string, string>, exec: { signal: AbortSignal }): Promise<Record<string, unknown>>
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
    expect(version).toBe('0.4.1')
  })

  it('declares and uses the injected service without resolving credentials', async () => {
    const signal = new AbortController().signal
    const generate = vi.fn<CpaImageGenerationService['generate']>().mockResolvedValue({
      data: new Uint8Array([1, 2, 3]),
      mediaType: 'image/png',
    })
    const imageService: CpaImageGenerationService = { generate }
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

    expect(inject).toContain(IMAGE_GENERATION_SERVICE)
    expect(inject).not.toContain('credentials')
    apply(ctx as never, { engine: 'gemini', saveToWorkspace: false })

    const tool = tools.register.mock.calls[0]?.[0] as RegisteredTool | undefined
    expect(tool).toBeDefined()
    const result = await tool!.execute({
      prompt: 'a blue circle',
      aspect_ratio: '16:9',
      image_size: '2K',
      size: '1536x864',
    }, { signal })

    expect(generate).toHaveBeenCalledWith({
      engine: 'gemini',
      prompt: 'a blue circle',
      aspectRatio: '16:9',
      imageSize: '2K',
      size: '1536x864',
      signal,
    })
    expect(result).toMatchObject({ attachment, engine: 'gemini' })
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

  it('maps aspect ratios to standard GPT size strings', () => {
    expect(gptSizeFromAspectRatio('9:16')).toBe('1024x1792')
    expect(gptSizeFromAspectRatio('16:9')).toBe('1792x1024')
    expect(gptSizeFromAspectRatio('1:1')).toBe('1024x1024')
    expect(gptSizeFromAspectRatio('2:3')).toBe('1024x1792')
    expect(gptSizeFromAspectRatio('3:2')).toBe('1792x1024')
    expect(gptSizeFromAspectRatio(undefined)).toBeUndefined()
  })
})
