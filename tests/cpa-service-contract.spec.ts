import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IMAGE_GENERATION_SERVICE, type CpaImageGenerationService } from '@LiuRJ99/dsh-cpa-plugin/image-generation'
import { apply, inject, name, version } from '../src/index.js'

vi.mock('@deepseek-ai/dsh-settings', () => ({
  installSettingsSection: vi.fn(),
  settingsNamespace: (name: string) => name,
}))

vi.mock('@deepseek-ai/dsh-tools', () => ({
  defineTool: (tool: unknown) => tool,
}))

interface RegisteredTool {
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
    expect(version).toBe('0.3.0')
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
})
