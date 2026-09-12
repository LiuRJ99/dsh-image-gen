import { describe, expect, it } from 'vitest'

import { createImageResultDefinition } from '../src/client/image-result-node.js'

const attachment = {
  attachmentId: 'sha256:promoted-image',
  mediaType: 'image/png',
  bytes: 4096,
  width: 512,
  height: 512,
}

function location(turn: number, endSeq?: number) {
  return {
    kind: 'turn' as const,
    turn: {
      turn,
      start: { seq: 1 },
      end: endSeq === undefined ? undefined : { seq: endSeq },
      status: endSeq === undefined ? 'open' as const : 'closed' as const,
      steps: [],
      data: { get: () => undefined },
    },
  }
}

function match(event: Record<string, unknown>, role: 'start' | 'update', endSeq?: number) {
  return { event, role, location: location(1, endSeq), view: undefined }
}

function context(state: unknown, matches: readonly ReturnType<typeof match>[], endSeq?: number) {
  return {
    key: 'dsh-image-result:1',
    kind: 'dsh-image-result',
    id: '1',
    matches,
    start: matches[0],
    state,
    current: new Map(),
    location: location(1, endSeq),
  }
}

describe('promoted image result conversation node', () => {
  const startEvent = { type: 'turn/start', seq: 1, time: 1000, data: { turn: 1 } }
  const resultEvent = {
    type: 'tool/result',
    seq: 4,
    time: 4000,
    data: {
      turn: 1,
      step: 1,
      message: { source: { callId: 'call-1' }, content: [] },
      meta: {
        kind: 'dsh-image-gen',
        attachment,
        prompt: 'a promoted image',
        provider: 'google',
        model: 'gemini',
        output: '1024x1024',
      },
    },
  }
  const answerEvent = {
    type: 'assistant/message',
    seq: 7,
    time: 7000,
    data: { turn: 1, step: 2, message: { content: [{ type: 'text', text: 'done' }] } },
  }
  const endEvent = { type: 'turn/end', seq: 8, time: 8000, data: { turn: 1 } }

  const startMatch = match(startEvent, 'start')
  const resultMatch = match(resultEvent, 'update')
  const answerMatch = match(answerEvent, 'update')
  const endMatch = match(endEvent, 'update', 8)
  const reader = { previous: () => undefined }

  function replay(definition: ReturnType<typeof createImageResultDefinition>, closeTurn: boolean) {
    let state = definition.start(context(undefined, [startMatch]), startMatch, reader)
    state = definition.update(context(state, [startMatch, resultMatch]), resultMatch)
    if (closeTurn) {
      state = definition.update(context(state, [startMatch, resultMatch, answerMatch]), answerMatch)
      state = definition.update(context(state, [startMatch, resultMatch, answerMatch, endMatch], 8), endMatch)
    }
    return state
  }

  it('re-anchors beside the final answer when the turn closes with an unknown transcript mode', () => {
    const definition = createImageResultDefinition()
    const state = replay(definition, true)

    const closedNode = definition.buildViewNode?.(
      context(state, [startMatch, resultMatch, answerMatch, endMatch], 8),
    )

    expect(closedNode).toMatchObject({
      kind: 'dsh-image-result',
      anchorSeq: 7,
      data: { results: [{ attachment, prompt: 'a promoted image' }] },
    })
    // Latest DSH folds ordinary nodes only while anchorSeq < answerAnchorSeq.
    expect((closedNode as { anchorSeq: number }).anchorSeq).toBeGreaterThanOrEqual(7)
  })

  it('keeps the image at its own tool/result position while the turn is open', () => {
    const definition = createImageResultDefinition()
    let state = definition.start(context(undefined, [startMatch]), startMatch, reader)
    state = definition.update(context(state, [startMatch, resultMatch]), resultMatch)

    const liveNode = definition.buildViewNode?.(context(state, [startMatch, resultMatch]))
    expect(liveNode).toMatchObject({ kind: 'dsh-image-result', anchorSeq: 4 })

    // A later assistant message within the same open Turn must not push the
    // image below it (the reported bottom-pinning bug).
    state = definition.update(context(state, [startMatch, resultMatch, answerMatch]), answerMatch)
    const stillLiveNode = definition.buildViewNode?.(
      context(state, [startMatch, resultMatch, answerMatch]),
    )
    expect(stillLiveNode).toMatchObject({ kind: 'dsh-image-result', anchorSeq: 4 })
  })

  it('keeps the natural position in normal transcript mode even when the turn closes', () => {
    const definition = createImageResultDefinition({ isCompactTranscript: () => false })
    const state = replay(definition, true)

    const closedNode = definition.buildViewNode?.(
      context(state, [startMatch, resultMatch, answerMatch, endMatch], 8),
    )

    expect(closedNode).toMatchObject({ kind: 'dsh-image-result', anchorSeq: 4 })
  })

  it('re-anchors beside the final answer in compact transcript mode when the turn closes', () => {
    const definition = createImageResultDefinition({ isCompactTranscript: () => true })
    const state = replay(definition, true)

    const closedNode = definition.buildViewNode?.(
      context(state, [startMatch, resultMatch, answerMatch, endMatch], 8),
    )

    expect(closedNode).toMatchObject({ kind: 'dsh-image-result', anchorSeq: 7 })
  })

  it('falls back to compact-safe anchoring when the transcript read throws', () => {
    const definition = createImageResultDefinition({
      isCompactTranscript: () => { throw new Error('settings unavailable') },
    })
    const state = replay(definition, true)

    const closedNode = definition.buildViewNode?.(
      context(state, [startMatch, resultMatch, answerMatch, endMatch], 8),
    )

    expect(closedNode).toMatchObject({ kind: 'dsh-image-result', anchorSeq: 7 })
  })

  it('ignores unrelated and failed tool results', () => {
    const unrelated = {
      type: 'tool/result',
      seq: 4,
      time: 4000,
      data: { turn: 1, step: 1, message: { source: { callId: 'call-1' }, content: [] }, meta: { kind: 'other' } },
    }
    expect(createImageResultDefinition().match(unrelated)).toBeNull()
  })
})

describe('ptc dispatch image results (#38)', () => {
  const dispatchEvent = {
    type: 'tool/ptc-dispatch',
    seq: 19,
    time: 19000,
    data: {
      rootCallId: 'run-1',
      parentCallId: 'run-1',
      subCallId: 'sub-1',
      name: 'edit_image',
      arguments: {
        prompt: 'a q-version comic',
        aspect_ratio: '2:3',
        source_attachment_id: 'sha256:source-image',
      },
      isError: false,
      content: [
        {
          type: 'text',
          text: 'Edited one image with openai-compat/gpt-image-2 (2:3). Attachment ID: sha256:ptc-image. The edited image is attached to the conversation. It was also saved to the workspace as image/image-1.png. Respond to the user without reading or searching for the image.',
        },
        {
          type: 'image',
          attachment: {
            attachmentId: 'sha256:ptc-image',
            mediaType: 'image/png',
            bytes: 2476872,
            width: 1024,
            height: 1536,
          },
        },
      ],
    },
  }

  function ptcMatch(event: Record<string, unknown>, role: 'start' | 'update' = 'start') {
    return { event, role, location: location(1), view: undefined }
  }

  function ptcContext(state: unknown, matches: readonly ReturnType<typeof ptcMatch>[]) {
    return {
      key: 'dsh-image-result:ptc:sub-1',
      kind: 'dsh-image-result',
      id: 'ptc:sub-1',
      matches,
      start: matches[0],
      state,
      current: new Map(),
      location: location(1),
    }
  }

  const reader = { previous: () => undefined }

  it('matches a successful plugin image dispatch and keys the node by sub-call', () => {
    expect(createImageResultDefinition().match(dispatchEvent)).toEqual({ id: 'ptc:sub-1', role: 'start' })
  })

  it('ignores dispatches from other tools, failed dispatches, and dispatches without a valid image', () => {
    const definition = createImageResultDefinition()
    expect(definition.match({ ...dispatchEvent, data: { ...dispatchEvent.data, name: 'read_file' } })).toBeNull()
    expect(definition.match({ ...dispatchEvent, data: { ...dispatchEvent.data, isError: true } })).toBeNull()
    expect(definition.match({ ...dispatchEvent, data: { ...dispatchEvent.data, content: [{ type: 'text', text: 'no image here' }] } })).toBeNull()
    expect(definition.match({ ...dispatchEvent, data: { ...dispatchEvent.data, content: [{ type: 'image', attachment: { attachmentId: 'sha256:x' } }] } })).toBeNull()
    expect(definition.match({ ...dispatchEvent, data: { ...dispatchEvent.data, subCallId: '' } })).toBeNull()
    // Turn-less non-dispatch events stay ignored exactly as before.
    expect(definition.match({ type: 'tool/result', seq: 20, data: { meta: { kind: 'dsh-image-gen' } } })).toBeNull()
  })

  it('builds a card node from the dispatch alone, recovering fields from the fixed summary text', () => {
    const definition = createImageResultDefinition()
    const match = ptcMatch(dispatchEvent)
    const state = definition.start(ptcContext(undefined, [match]), match, reader)

    const node = definition.buildViewNode?.(ptcContext(state, [match]))

    expect(node).toMatchObject({
      kind: 'dsh-image-result',
      anchorSeq: 19,
      data: {
        results: [{
          attachment: { attachmentId: 'sha256:ptc-image', mediaType: 'image/png' },
          prompt: 'a q-version comic',
          provider: 'openai-compat',
          model: 'gpt-image-2',
          output: '2:3',
          savedTo: 'image/image-1.png',
          sourceAttachmentIds: ['sha256:source-image'],
        }],
      },
    })
  })

  it('merges a re-dispatch of the same sub-call without duplicating the image', () => {
    const definition = createImageResultDefinition()
    const match = ptcMatch(dispatchEvent, 'update')
    const state = definition.start(
      ptcContext(undefined, [ptcMatch(dispatchEvent)]),
      ptcMatch(dispatchEvent),
      reader,
    )

    const merged = definition.update(ptcContext(state, [match]), match)

    expect(merged.results).toHaveLength(1)
    expect(merged.results[0]).toMatchObject({ attachment: { attachmentId: 'sha256:ptc-image' } })
  })

  it('falls back to neutral provider/model when the summary text cannot be parsed', () => {
    const definition = createImageResultDefinition()
    const event = {
      ...dispatchEvent,
      data: {
        ...dispatchEvent.data,
        content: [
          { type: 'text', text: 'something unexpected happened' },
          ...dispatchEvent.data.content.filter(block => block.type === 'image'),
        ],
      },
    }
    const match = ptcMatch(event)
    const state = definition.start(ptcContext(undefined, [match]), match, reader)
    const node = definition.buildViewNode?.(ptcContext(state, [match]))

    expect(node).toMatchObject({
      data: { results: [{ prompt: 'a q-version comic', provider: '', model: '', output: '' }] },
    })
  })
})
