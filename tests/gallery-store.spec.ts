import { describe, expect, it } from 'vitest'
import { normalizeGalleryItem } from '../src/client/gallery-store.js'

const attachment = {
  attachmentId: 'sha256:gallery-test',
  mediaType: 'image/png' as const,
  bytes: 4,
  width: 1,
  height: 1,
}

describe('normalizeGalleryItem', () => {
  it('maps legacy OpenAI metadata to the GPT engine', () => {
    expect(normalizeGalleryItem({ provider: 'openai', model: 'gpt-image-2' })).toMatchObject({
      engine: 'gpt',
      model: 'gpt-image-2',
    })
  })

  it('maps legacy Google metadata to the Gemini engine', () => {
    expect(normalizeGalleryItem({ provider: 'google', model: 'gemini-3.1-flash-image' })).toMatchObject({
      engine: 'gemini',
      model: 'gemini-3.1-flash-image',
    })
  })

  it('keeps new engine metadata unchanged', () => {
    expect(normalizeGalleryItem({ engine: 'gemini', model: 'gemini-3.1-flash-image' })).toMatchObject({
      engine: 'gemini',
      model: 'gemini-3.1-flash-image',
    })
  })

  it('preserves the attachment ID and Gallery metadata during migration', () => {
    const item = normalizeGalleryItem({
      id: attachment.attachmentId,
      attachment,
      prompt: 'A blue circle',
      provider: 'openai',
      model: 'gpt-image-2',
      output: '1:1',
      createdAt: 123,
    })

    expect(item).toMatchObject({
      id: attachment.attachmentId,
      attachment,
      prompt: 'A blue circle',
      engine: 'gpt',
      model: 'gpt-image-2',
      output: '1:1',
      createdAt: 123,
    })
  })

  it('keeps an unknown provider explicit and diagnosable', () => {
    const item = normalizeGalleryItem({ provider: 'seedream', model: 'legacy-model' })

    expect(item.engine).toBe('unknown')
    expect(item.legacyProvider).toBe('seedream')
    expect(item.normalizationError).toContain('seedream')
  })
})
