import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import type { ToolCallBlock } from '@deepseek-ai/dsh-client-ui-chat/client'
import { describe, expect, it } from 'vitest'
import { imageRef } from '../src/client/index.js'

const SAMPLE_ATTACHMENT: ImageAttachmentRef = {
  attachmentId: 'sha256:c8583c9fde1a3d79cfd6c377de07e609b1031615db47be78d157f10e936af79b',
  mediaType: 'image/png',
  width: 1197,
  height: 1315,
  bytes: 2231613,
  name: 'generated-image',
}

describe('imageRef', () => {
  it('extracts attachment from block.meta (DSH 0.1.2-rc.1 presentationMeta)', () => {
    const block: ToolCallBlock = {
      kind: 'tool-result',
      seq: 10,
      time: 1788603729000,
      callId: 'call-1',
      call: { name: 'generate_image', argsRaw: '{"prompt":"a cute cat"}' },
      callTime: 1788603700000,
      content: [
        { type: 'text', text: 'Generated one image with the gpt engine (). It is already attached to the conversation.' },
      ],
      isError: false,
      subCalls: [],
      meta: {
        kind: 'dsh-image-gen',
        attachment: SAMPLE_ATTACHMENT,
        engine: 'gpt',
        output: '',
        createdAt: 1788603729000,
        savedTo: '/path/to/image.png',
        prompt: 'a cute cat',
      },
    }

    const ref = imageRef(block)
    expect(ref).toEqual(SAMPLE_ATTACHMENT)
  })

  it('extracts attachment from block.content (fallback for upstream compatibility)', () => {
    const block: ToolCallBlock = {
      kind: 'tool-result',
      seq: 11,
      time: 1788603729000,
      callId: 'call-2',
      call: { name: 'generate_image', argsRaw: '{"prompt":"a cute cat"}' },
      callTime: 1788603700000,
      content: [
        { type: 'text', text: 'Generated image' },
        { type: 'image', attachment: SAMPLE_ATTACHMENT },
      ],
      isError: false,
      subCalls: [],
    }

    const ref = imageRef(block)
    expect(ref).toEqual(SAMPLE_ATTACHMENT)
  })

  it('returns undefined when running (not settled tool-result)', () => {
    const runningBlock: ToolCallBlock = {
      callId: 'call-3',
      name: 'generate_image',
      argsRaw: '{"prompt":"a cute cat"}',
      turn: 1,
      step: 1,
      time: 1788603700000,
      subCalls: [],
    }

    expect(imageRef(runningBlock)).toBeUndefined()
  })

  it('returns undefined when neither meta nor content has valid image attachment', () => {
    const block: ToolCallBlock = {
      kind: 'tool-result',
      seq: 12,
      time: 1788603729000,
      callId: 'call-4',
      call: { name: 'generate_image', argsRaw: '{"prompt":"a cute cat"}' },
      callTime: 1788603700000,
      content: [{ type: 'text', text: 'no image here' }],
      isError: false,
      subCalls: [],
      meta: { kind: 'other-tool' },
    }

    expect(imageRef(block)).toBeUndefined()
  })
})
