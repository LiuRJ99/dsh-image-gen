import { describe, expect, it } from 'vitest'
import type { Edge } from '@xyflow/react'
import {
  buildGenerationRequest,
  buildImportGraph,
  imageNodeIdOf,
  isLegalConnection,
  mergeIntoCanvas,
  newConfigNode,
  newImageNode,
  newTextNode,
  outputPosition,
  resolveConfigInputs,
  canvasEdge,
  type CanvasNode,
  type ImportRecord,
} from '../src/client/canvas/canvas-model.js'

const attachment = (id: string) => ({
  attachmentId: id,
  mediaType: 'image/png' as const,
  bytes: 1024,
  width: 512,
  height: 512,
})

function configNode(prompt = '', provider = 'google'): Extract<CanvasNode, { data: { kind: 'config' } }> {
  return {
    id: 'cfg-1',
    type: 'config',
    position: { x: 0, y: 0 },
    data: {
      kind: 'config',
      provider,
      model: 'gemini-2.5-flash-image',
      prompt,
      ratio: '1:1',
      quality: '1K',
      count: 1,
    },
  }
}

describe('canvas connection legality', () => {
  const text = newTextNode('hi', 0, 0)
  const image = newImageNode({ attachment: attachment('a1'), x: 0, y: 0 })
  const config = configNode()

  it('allows text and image sources into config targets', () => {
    expect(isLegalConnection(text, config)).toBe(true)
    expect(isLegalConnection(image, config)).toBe(true)
  })

  it('allows config outputs into image targets (generation edges) and image→image edit chains', () => {
    expect(isLegalConnection(config, image)).toBe(true)
    expect(isLegalConnection(image, newImageNode({ attachment: attachment('a2'), x: 0, y: 0 }))).toBe(true)
  })

  it('rejects same-kind, text→image, and malformed connections', () => {
    expect(isLegalConnection(config, config)).toBe(false)
    expect(isLegalConnection(text, text)).toBe(false)
    expect(isLegalConnection(text, image)).toBe(false)
    expect(isLegalConnection(image, text)).toBe(false)
    expect(isLegalConnection(undefined, config)).toBe(false)
    expect(isLegalConnection(text, undefined)).toBe(false)
  })
})

describe('canvas edge factory', () => {
  it('bakes the arrowhead into every programmatic edge', () => {
    const plain = canvasEdge('img-a', 'img-b')
    expect(plain).toMatchObject({ id: 'e-img-a-img-b', source: 'img-a', target: 'img-b', markerEnd: { type: 'arrowclosed' } })
    const output = canvasEdge('cfg-1', 'img-a', 'dcv-edge-output')
    expect(output.className).toBe('dcv-edge-output')
    expect(canvasEdge('a', 'b').className).toBeUndefined()
  })
})

describe('config input resolution and request building', () => {
  it('collects connected text and image nodes', () => {
    const nodes: CanvasNode[] = [
      newTextNode('a cat', 0, 0),
      newTextNode('in space', 0, 100),
      newImageNode({ attachment: attachment('ref1'), x: 0, y: 200 }),
      newImageNode({ encoded: { mediaType: 'image/png', data: 'AAAA' }, x: 0, y: 300 }),
      configNode(),
    ]
    const edges: Edge[] = nodes.map((node, index) => ({
      id: `e-${String(index)}`,
      source: node.id,
      target: 'cfg-1',
    }))
    const inputs = resolveConfigInputs(nodes, edges, 'cfg-1')
    expect(inputs.promptParts).toEqual(['a cat', 'in space'])
    expect(inputs.referenceAttachments.map(ref => ref.attachmentId)).toEqual(['ref1'])
    expect(inputs.encodedReferences).toEqual([{ mediaType: 'image/png', data: 'AAAA' }])
  })

  it('ignores edges that target other nodes', () => {
    const nodes: CanvasNode[] = [newTextNode('a cat', 0, 0), configNode()]
    const edges: Edge[] = [{ id: 'e-1', source: nodes[0].id, target: 'cfg-other' }]
    const inputs = resolveConfigInputs(nodes, edges, 'cfg-1')
    expect(inputs.promptParts).toEqual([])
  })

  it('builds a generate request with no references', () => {
    const request = buildGenerationRequest(configNode('a cat'), { promptParts: [], referenceAttachments: [], encodedReferences: [] })
    expect(request).toMatchObject({ mode: 'generate', prompt: 'a cat', provider: 'google' })
    expect(request?.references).toBeUndefined()
  })

  it('combines config prompt with connected text parts and switches to edit mode with images', () => {
    const request = buildGenerationRequest(configNode('make it'), {
      promptParts: ['a cat', 'in space'],
      referenceAttachments: [attachment('ref1')],
      encodedReferences: [],
    })
    expect(request).toMatchObject({ mode: 'edit', prompt: 'make it\n\na cat\n\nin space' })
    expect(request?.references).toEqual([{ attachment: attachment('ref1') }])
  })

  it('returns undefined when the combined prompt is empty', () => {
    expect(buildGenerationRequest(configNode(''), { promptParts: [], referenceAttachments: [], encodedReferences: [] })).toBeUndefined()
    expect(buildGenerationRequest(configNode('  '), { promptParts: [' '], referenceAttachments: [], encodedReferences: [] })).toBeUndefined()
  })

  it('forwards count only above one', () => {
    const single = buildGenerationRequest(configNode('x'), { promptParts: [], referenceAttachments: [], encodedReferences: [] })
    expect(single?.count).toBeUndefined()
    const config = configNode('x')
    config.data.count = 3
    const multi = buildGenerationRequest(config, { promptParts: [], referenceAttachments: [], encodedReferences: [] })
    expect(multi?.count).toBe(3)
  })
})

describe('output placement', () => {
  it('stacks results to the right of the config node', () => {
    const config = configNode()
    config.position = { x: 100, y: 50 }
    const first = outputPosition(config, 0, 0)
    const second = outputPosition(config, 1, 0)
    const firstBatch = outputPosition(config, 0, 1)
    expect(first).toEqual({ x: 520, y: 50 })
    expect(second).toEqual({ x: 520, y: 380 })
    expect(firstBatch).toEqual({ x: 520, y: 380 })
  })
})

describe('import graph rebuild', () => {
  const records: ImportRecord[] = [
    { attachmentId: 'a', attachment: attachment('a'), createdAt: 1 },
    { attachmentId: 'b', attachment: attachment('b'), createdAt: 2, sourceAttachmentIds: ['a'] },
    { attachmentId: 'c', attachment: attachment('c'), createdAt: 3, sourceAttachmentIds: ['a'] },
    { attachmentId: 'd', attachment: attachment('d'), createdAt: 4, sourceAttachmentIds: ['b', 'c'] },
    // Duplicate record (re-render of the same card) must not add a node.
    { attachmentId: 'a', attachment: attachment('a'), createdAt: 5 },
  ]

  it('creates one node per unique attachment and layers by edit depth', () => {
    const graph = buildImportGraph(records)
    expect(graph.nodes.map(node => node.id)).toEqual([
      imageNodeIdOf('a'),
      imageNodeIdOf('b'),
      imageNodeIdOf('c'),
      imageNodeIdOf('d'),
    ])
    const position = new Map(graph.nodes.map(node => [node.id, node.position.x]))
    expect(position.get(imageNodeIdOf('a'))).toBeLessThan(position.get(imageNodeIdOf('b'))!)
    expect(position.get(imageNodeIdOf('b'))).toBeLessThan(position.get(imageNodeIdOf('d'))!)
  })

  it('rebuilds edit-chain edges without duplicates or self loops', () => {
    const graph = buildImportGraph(records)
    expect(graph.edges.map(edge => `${edge.source}->${edge.target}`).sort()).toEqual([
      `img-a->img-b`,
      `img-a->img-c`,
      `img-b->img-d`,
      `img-c->img-d`,
    ].sort())
  })

  it('drops edges to unknown sources and to missing targets', () => {
    const graph = buildImportGraph([
      { attachmentId: 'x', attachment: attachment('x'), sourceAttachmentIds: ['ghost'] },
    ])
    expect(graph.nodes).toHaveLength(1)
    expect(graph.edges).toHaveLength(0)
  })
})

describe('canvas merge', () => {
  it('dedupes nodes and edges when re-importing', () => {
    const existing = buildImportGraph([{ attachmentId: 'a', attachment: attachment('a') }])
    const incoming = buildImportGraph([
      { attachmentId: 'a', attachment: attachment('a') },
      { attachmentId: 'b', attachment: attachment('b'), sourceAttachmentIds: ['a'] },
    ])
    const merged = mergeIntoCanvas(existing, incoming, { x: 100, y: 100 })
    expect(merged.nodes.map(node => node.id).sort()).toEqual(['img-a', 'img-b'].sort())
    expect(merged.edges).toHaveLength(1)
  })

  it('offsets only newly added nodes', () => {
    const existing = buildImportGraph([{ attachmentId: 'a', attachment: attachment('a') }])
    const incoming = buildImportGraph([{ attachmentId: 'b', attachment: attachment('b') }])
    const merged = mergeIntoCanvas(existing, incoming, { x: 50, y: 25 })
    const byId = new Map(merged.nodes.map(node => [node.id, node.position]))
    expect(byId.get('img-a')).toEqual({ x: 60, y: 60 })
    expect(byId.get('img-b')).toEqual({ x: 110, y: 85 })
  })
})

describe('config node defaults', () => {
  it('seeds from the provider profile when present', () => {
    const node = newConfigNode({
      provider: 'openai',
      label: 'OpenAI',
      model: 'gpt-image-1',
      configured: true,
      supportsEditing: true,
      ratioOptions: [{ value: '1:1', label: '1:1' }],
      qualityOptions: [{ value: '1K', label: '1K' }],
      defaultRatio: '16:9',
      defaultQuality: '2K',
    }, 0, 0)
    expect(node.data).toMatchObject({ provider: 'openai', model: 'gpt-image-1', ratio: '16:9', quality: '2K', count: 1 })
  })

  it('falls back to google defaults without a profile', () => {
    const node = newConfigNode(undefined, 0, 0)
    expect(node.data).toMatchObject({ provider: 'google', model: '', ratio: '1:1', quality: '1K', count: 1 })
  })
})
