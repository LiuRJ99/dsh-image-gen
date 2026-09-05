import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import { describe, expect, it } from 'vitest'
import {
  imageDeliverablesDefinition,
  selectGeneratedImages,
  type ImageDeliverablesState,
} from '../src/client/turn-tail.js'

const SAMPLE_ATTACHMENT: ImageAttachmentRef = {
  attachmentId: 'sha256:c8583c9fde1a3d79cfd6c377de07e609b1031615db47be78d157f10e936af79b',
  mediaType: 'image/png',
  width: 1197,
  height: 1315,
  bytes: 2231613,
  name: 'generated-image',
}

describe('imageDeliverablesDefinition', () => {
  it('matches turn/start, tool/call, and append tool/result', () => {
    expect(imageDeliverablesDefinition.match({ type: 'turn/start', data: { turn: 1 } })).toEqual({
      id: '1',
      role: 'start',
    })
    expect(imageDeliverablesDefinition.match({ type: 'tool/call', data: { turn: 1 } })).toEqual({
      id: '1',
      role: 'update',
    })
    expect(
      imageDeliverablesDefinition.match({
        type: 'tool/result',
        surfaceOp: 'append',
        data: { turn: 1 },
      } as never),
    ).toEqual({
      id: '1',
      role: 'update',
    })
    expect(imageDeliverablesDefinition.match({ type: 'unknown' })).toBeNull()
  })

  it('accumulates generated image deliverables from call and result events', () => {
    const state = imageDeliverablesDefinition.start(null, { event: { data: { turn: 1 } } })
    expect(state).toEqual({
      turn: 1,
      calls: new Map(),
      images: [],
    })

    // 1. Tool call
    const afterCall = imageDeliverablesDefinition.update(
      { state },
      {
        event: {
          type: 'tool/call',
          data: {
            turn: 1,
            callId: 'call-1',
            name: 'generate_image',
            arguments: JSON.stringify({ prompt: 'A fluffy cat' }),
          },
        },
      },
    )
    expect(afterCall.calls.get('call-1')).toEqual({ prompt: 'A fluffy cat' })

    // 2. Tool result
    const afterResult = imageDeliverablesDefinition.update(
      { state: afterCall },
      {
        event: {
          type: 'tool/result',
          seq: 42,
          surfaceOp: 'append',
          data: {
            turn: 1,
            message: {
              source: { callId: 'call-1' },
              content: [{ type: 'tool-result', isError: false }],
            },
            meta: {
              kind: 'dsh-image-gen',
              attachment: SAMPLE_ATTACHMENT,
              engine: 'gpt',
              savedTo: '/work/cat.png',
              createdAt: 1788603729000,
              prompt: 'A fluffy cat',
            },
          },
        },
      },
    )

    expect(afterResult.images).toHaveLength(1)
    expect(afterResult.images[0]).toEqual({
      seq: 42,
      callId: 'call-1',
      attachment: SAMPLE_ATTACHMENT,
      prompt: 'A fluffy cat',
      engine: 'gpt',
      savedTo: '/work/cat.png',
      createdAt: 1788603729000,
    })

    // 3. buildLocationData
    const locData = imageDeliverablesDefinition.buildLocationData({ state: afterResult }, 'turn', undefined)
    expect(locData).toEqual({
      kind: 'turn',
      turn: 1,
      key: 'image-generation-deliverables',
      value: { images: afterResult.images },
    })
  })

  it('ignores error tool results', () => {
    const initialState: ImageDeliverablesState = {
      turn: 1,
      calls: new Map([['call-fail', { prompt: 'bad' }]]),
      images: [],
    }

    const state = imageDeliverablesDefinition.update(
      { state: initialState },
      {
        event: {
          type: 'tool/result',
          seq: 43,
          surfaceOp: 'append',
          data: {
            turn: 1,
            message: {
              source: { callId: 'call-fail' },
              content: [{ isError: true }],
            },
          },
        },
      },
    )

    expect(state.images).toHaveLength(0)
  })
})

describe('selectGeneratedImages', () => {
  it('returns valid deliverables before the closing seq', () => {
    const deliverable = {
      seq: 40,
      callId: 'call-1',
      attachment: SAMPLE_ATTACHMENT,
      prompt: 'a cat',
      engine: 'gpt',
    }
    const store = new Map<string, unknown>([['image-generation-deliverables', { images: [deliverable] }]])
    const owner = {
      turn: { data: store },
      seq: 50,
    }

    const matched = selectGeneratedImages(owner)
    expect(matched).toEqual([deliverable])
  })

  it('returns null when no images were generated in the turn', () => {
    const store = new Map<string, unknown>()
    const owner = {
      turn: { data: store },
      seq: 50,
    }

    expect(selectGeneratedImages(owner)).toBeNull()
  })

  it('filters out deliverables produced after the closing seq', () => {
    const deliverable = {
      seq: 60,
      callId: 'call-1',
      attachment: SAMPLE_ATTACHMENT,
      prompt: 'a cat',
      engine: 'gpt',
    }
    const store = new Map<string, unknown>([['image-generation-deliverables', { images: [deliverable] }]])
    const owner = {
      turn: { data: store },
      seq: 50,
    }

    expect(selectGeneratedImages(owner)).toBeNull()
  })
})
