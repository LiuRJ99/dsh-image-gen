/**
 * Canvas domain model: pure node/edge helpers shared by the canvas view,
 * the import bridge and unit tests. No React, no IO.
 */
import type { Edge, Node } from '@xyflow/react'
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import type { StudioGenerateRequest, StudioProviderProfile } from '../../shared.js'

export interface ImageNodeData extends Record<string, unknown> {
  kind: 'image'
  /** Durable attachment-backed image (generated results, conversation imports). */
  attachment?: ImageAttachmentRef
  /** Locally uploaded image kept as base64 until used as a generation reference. */
  encoded?: { mediaType: string; data: string }
  prompt?: string
  pending?: boolean
  error?: string
}

export interface TextNodeData extends Record<string, unknown> {
  kind: 'text'
  text: string
}

export interface ConfigNodeData extends Record<string, unknown> {
  kind: 'config'
  provider: string
  model: string
  prompt: string
  ratio: string
  quality: string
  count: number
  generating?: boolean
  error?: string
}

export type CanvasNode = Node<ImageNodeData | TextNodeData | ConfigNodeData>
export type ConfigNode = Node<ConfigNodeData>

export interface CanvasDocument {
  nodes: CanvasNode[]
  edges: Edge[]
  viewport?: { x: number; y: number; zoom: number }
  updatedAt: number
}

let nextSerial = 0
/** Collision-safe node id (also stable across sessions via the random suffix). */
export function newId(prefix: string): string {
  nextSerial += 1
  return `${prefix}-${nextSerial.toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

/** Stable node id for one attachment so repeated imports/generations dedupe. */
export function imageNodeIdOf(attachmentId: string): string {
  return `img-${attachmentId}`
}

export function nodeKindOf(node: CanvasNode | undefined): string | undefined {
  return node !== undefined && typeof node.data?.kind === 'string' ? node.data.kind : undefined
}

export function newTextNode(text = '', x: number, y: number): CanvasNode {
  return { id: newId('text'), type: 'text', position: { x, y }, data: { kind: 'text', text } }
}

export function newConfigNode(profile: StudioProviderProfile | undefined, x: number, y: number): CanvasNode {
  return {
    id: newId('cfg'),
    type: 'config',
    position: { x, y },
    data: {
      kind: 'config',
      provider: profile?.provider ?? 'google',
      model: profile?.model ?? '',
      prompt: '',
      ratio: profile?.defaultRatio ?? '1:1',
      quality: profile?.defaultQuality ?? '1K',
      count: 1,
    },
  }
}

export function newImageNode(input: {
  attachment?: ImageAttachmentRef
  encoded?: { mediaType: string; data: string }
  prompt?: string
  pending?: boolean
  error?: string
  x: number
  y: number
}, id = newId('img')): CanvasNode {
  return {
    id,
    type: 'image',
    position: { x: input.x, y: input.y },
    data: {
      kind: 'image',
      ...(input.attachment !== undefined ? { attachment: input.attachment } : {}),
      ...(input.encoded !== undefined ? { encoded: input.encoded } : {}),
      ...(input.prompt !== undefined && input.prompt.length > 0 ? { prompt: input.prompt } : {}),
      ...(input.pending === true ? { pending: true } : {}),
      ...(input.error !== undefined ? { error: input.error } : {}),
    },
  }
}

/** Whether an edge is legal in the canvas graph: prompt/reference sources feed config nodes. */
export function isLegalConnection(source: CanvasNode | undefined, target: CanvasNode | undefined): boolean {
  const sourceKind = nodeKindOf(source)
  const targetKind = nodeKindOf(target)
  return (sourceKind === 'text' || sourceKind === 'image') && targetKind === 'config'
}

/** Everything a config node needs to know about its incoming edges. */
export interface ResolvedInputs {
  promptParts: string[]
  referenceAttachments: ImageAttachmentRef[]
  encodedReferences: Array<{ mediaType: string; data: string }>
}

export function resolveConfigInputs(nodes: readonly CanvasNode[], edges: readonly Edge[], configNodeId: string): ResolvedInputs {
  const byId = new Map<string, CanvasNode>()
  for (const node of nodes) byId.set(node.id, node)
  const promptParts: string[] = []
  const referenceAttachments: ImageAttachmentRef[] = []
  const encodedReferences: Array<{ mediaType: string; data: string }> = []
  for (const edge of edges) {
    if (edge.target !== configNodeId) continue
    const source = byId.get(edge.source)
    if (source === undefined) continue
    const data = source.data as ImageNodeData | TextNodeData | ConfigNodeData | undefined
    if (data?.kind === 'text' && typeof data.text === 'string' && data.text.trim().length > 0) {
      promptParts.push(data.text.trim())
    } else if (data?.kind === 'image') {
      if (data.attachment !== undefined) referenceAttachments.push(data.attachment)
      else if (data.encoded !== undefined) encodedReferences.push(data.encoded)
    }
  }
  return { promptParts, referenceAttachments, encodedReferences }
}

/** Build the studio request for one config node. Returns undefined when the prompt is empty. */
export function buildGenerationRequest(
  config: ConfigNode,
  inputs: ResolvedInputs,
): StudioGenerateRequest | undefined {
  const prompt = [config.data.prompt.trim(), ...inputs.promptParts]
    .filter(part => part.trim().length > 0)
    .join('\n\n')
  if (prompt.length === 0) return undefined
  const hasReferences = inputs.referenceAttachments.length > 0 || inputs.encodedReferences.length > 0
  return {
    mode: hasReferences ? 'edit' : 'generate',
    provider: config.data.provider as StudioGenerateRequest['provider'],
    model: config.data.model,
    prompt,
    ratio: config.data.ratio,
    quality: config.data.quality,
    ...(config.data.count > 1 ? { count: config.data.count } : {}),
    ...(hasReferences
      ? {
        references: [
          ...inputs.referenceAttachments.map(attachment => ({ attachment })),
          ...inputs.encodedReferences.map(encoded => ({ mediaType: encoded.mediaType as 'image/png', data: encoded.data })),
        ],
      }
      : {}),
  }
}

/** Position for the k-th output image spawned by one config node. */
export function outputPosition(config: CanvasNode, existingOutputCount: number, index: number): { x: number; y: number } {
  return { x: config.position.x + 420, y: config.position.y + (existingOutputCount + index) * 330 }
}

/** One imported generation record (gallery item or pending bridge payload). */
export interface ImportRecord {
  attachmentId: string
  attachment: ImageAttachmentRef
  prompt?: string
  provider?: string
  model?: string
  createdAt?: number
  sourceAttachmentIds?: readonly string[]
}

/** Rebuild image nodes and edit-chain edges from import records (ordered oldest first). */
export function buildImportGraph(records: readonly ImportRecord[]): { nodes: CanvasNode[]; edges: Edge[] } {
  const sorted = [...records].sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0))
  const seen = new Map<string, CanvasNode>()
  const pendingEdges: Array<{ source: string; target: string }> = []
  for (const record of sorted) {
    const id = imageNodeIdOf(record.attachmentId)
    if (!seen.has(id)) {
      seen.set(id, newImageNode({
        attachment: record.attachment,
        ...(record.prompt !== undefined && record.prompt.length > 0 ? { prompt: record.prompt } : {}),
        x: 0,
        y: 0,
      }, id))
    }
    for (const sourceId of record.sourceAttachmentIds ?? []) {
      pendingEdges.push({ source: imageNodeIdOf(sourceId), target: id })
    }
  }
  const edges: Edge[] = []
  const edgeKeys = new Set<string>()
  for (const { source, target } of pendingEdges) {
    if (!seen.has(source) || !seen.has(target) || source === target) continue
    const key = `${source}->${target}`
    if (edgeKeys.has(key)) continue
    edgeKeys.add(key)
    edges.push({ id: `e-${key}`, source, target })
  }
  // Layered layout: depth by distance from chain roots, then stack each layer.
  const depth = new Map<string, number>()
  const incoming = new Map<string, string[]>()
  for (const edge of edges) {
    const list = incoming.get(edge.target) ?? []
    list.push(edge.source)
    incoming.set(edge.target, list)
  }
  const depthOf = (id: string): number => {
    const cached = depth.get(id)
    if (cached !== undefined) return cached
    const parents = incoming.get(id) ?? []
    const value = parents.length === 0 ? 0 : Math.max(...parents.map(depthOf)) + 1
    depth.set(id, value)
    return value
  }
  for (const node of seen.values()) depthOf(node.id)
  const perLayer = new Map<number, number>()
  for (const [id, node] of seen) {
    const layer = depth.get(id) ?? 0
    const slot = perLayer.get(layer) ?? 0
    perLayer.set(layer, slot + 1)
    node.position = { x: 60 + layer * 340, y: 60 + slot * 300 }
  }
  return { nodes: [...seen.values()], edges }
}

/** Merge an import graph into existing canvas state (nodes dedupe by id, edges by key). */
export function mergeIntoCanvas(
  current: { nodes: readonly CanvasNode[]; edges: readonly Edge[] },
  incoming: { nodes: readonly CanvasNode[]; edges: readonly Edge[] },
  offset: { x: number; y: number },
): { nodes: CanvasNode[]; edges: Edge[] } {
  const existingIds = new Set(current.nodes.map(node => node.id))
  const nodes = [...current.nodes]
  for (const node of incoming.nodes) {
    if (existingIds.has(node.id)) continue
    nodes.push({ ...node, position: { x: node.position.x + offset.x, y: node.position.y + offset.y } })
  }
  const edgeKeys = new Set(current.edges.map(edge => `${edge.source}->${edge.target}`))
  const edges = [...current.edges]
  for (const edge of incoming.edges) {
    const key = `${edge.source}->${edge.target}`
    if (edgeKeys.has(key)) continue
    edgeKeys.add(key)
    edges.push(edge)
  }
  return { nodes, edges }
}

/** Serialize the graph for persistence (strips volatile flags). */
export function toDocument(nodes: readonly CanvasNode[], edges: readonly Edge[], viewport?: { x: number; y: number; zoom: number }): CanvasDocument {
  return {
    nodes: nodes.map(node => ({ ...node, selected: false })),
    edges: edges.map(edge => ({ ...edge, selected: false })),
    ...(viewport !== undefined ? { viewport } : {}),
    updatedAt: Date.now(),
  }
}
