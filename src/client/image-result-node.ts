/** Modern DSH conversation node that keeps completed image artifacts outside Compact process folding. */
import type { ImageAttachmentRef, ImageMediaType } from '@deepseek-ai/dsh-attachment'

export const IMAGE_RESULT_NODE_KIND = 'dsh-image-result'

export interface ImageResultPresentation {
  readonly attachment: ImageAttachmentRef
  readonly prompt: string
  readonly provider: string
  readonly model: string
  readonly output: string
  readonly savedTo?: string
  /** Workflow seed reported by the ComfyUI provider, when available. */
  readonly seed?: number
  /** Attachment ids of the edit sources when this image came from edit_image; used to rebuild canvas edit chains. */
  readonly sourceAttachmentIds?: readonly string[]
}

interface ImageResultState {
  /** Owning conversation turn; PTC (run_code) sub-call results carry no turn. */
  readonly turn?: number
  readonly results: readonly (ImageResultPresentation & { readonly seq: number })[]
  readonly answerSeq?: number
  readonly endSeq?: number
}

interface EventLike {
  readonly type: string
  readonly seq: number
  readonly data: Record<string, unknown>
}

interface MatchLike {
  readonly event: EventLike
  readonly location: unknown
}

interface ContextLike<State> {
  readonly key: string
  readonly id: string
  readonly matches: readonly MatchLike[]
  readonly start?: MatchLike
  readonly state?: State
}

interface ConversationNodeDefinitionLike<State> {
  readonly kind: string
  readonly target: 'chat'
  match(event: EventLike): { id: string; role: 'start' | 'update' } | null
  start(context: ContextLike<State>, match: MatchLike, reader: unknown): State
  update(context: ContextLike<State> & { readonly state: State }, match: MatchLike): State
  buildViewNode(context: ContextLike<State>): Record<string, unknown> | null
}

/** Options controlling where the artifact anchors as its Turn progresses. */
export interface ImageResultNodeOptions {
  /**
   * Whether the host transcript view folds completed-Turn process content
   * (Compact mode). Omission or a thrown/unavailable read falls back to
   * Compact-safe anchoring, which keeps the artifact always visible.
   */
  readonly isCompactTranscript?: () => boolean
}

/** Default definition: unknown transcript mode falls back to Compact-safe anchoring. */
export const imageResultDefinition: ConversationNodeDefinitionLike<ImageResultState> =
  createImageResultDefinition()

/**
 * One image result row per Turn, anchored at its own tool/result position while
 * the Turn runs, then optionally re-anchored beside the final answer once the
 * Turn closes (only needed under the folding Compact transcript view).
 */
export function createImageResultDefinition(
  options: ImageResultNodeOptions = {},
): ConversationNodeDefinitionLike<ImageResultState> {
  return {
    kind: IMAGE_RESULT_NODE_KIND,
    target: 'chat',
    match: (event) => {
      // PTC (run_code) sub-calls carry neither a turn nor presentationMeta, so
      // they cannot join the turn-keyed flow. A successful dispatch of our own
      // image tools becomes its own node keyed by the sub-call (#38).
      if (event.type === 'tool/ptc-dispatch') {
        const subCallId = event.data.subCallId
        if (typeof subCallId !== 'string' || subCallId === '') return null
        return imageResultFromPtcDispatch(event) === undefined
          ? null
          : { id: `ptc:${subCallId}`, role: 'start' }
      }
      const turn = eventTurn(event)
      if (turn === undefined) return null
      if (event.type === 'turn/start') return { id: String(turn), role: 'start' }
      if (event.type === 'turn/end') return { id: String(turn), role: 'update' }
      if (event.type === 'assistant/message') return { id: String(turn), role: 'update' }
      if (event.type === 'tool/result' && imageResultFromMeta(event.data.meta) !== undefined) {
        return { id: String(turn), role: 'update' }
      }
      return null
    },
    start: (_context, match) => {
      if (match.event.type === 'tool/ptc-dispatch') {
        const result = imageResultFromPtcDispatch(match.event)
        if (result === undefined) throw new Error('dsh-image-result start requires a plugin image dispatch')
        return { results: [{ ...result, seq: match.event.seq }] }
      }
      const turn = eventTurn(match.event)
      if (match.event.type !== 'turn/start' || turn === undefined) {
        throw new Error('dsh-image-result start requires turn/start')
      }
      return { turn, results: [] }
    },
    update: (context, match) => {
      if (match.event.type === 'turn/end') return { ...context.state, endSeq: match.event.seq }
      if (match.event.type === 'assistant/message') return { ...context.state, answerSeq: match.event.seq }
      if (match.event.type === 'tool/ptc-dispatch') {
        // Defensive merge: a re-dispatch of the same sub-call must not duplicate.
        const result = imageResultFromPtcDispatch(match.event)
        return result === undefined ? context.state : appendResult(context.state, result, match.event.seq)
      }
      if (match.event.type !== 'tool/result') return context.state
      const result = imageResultFromMeta(match.event.data.meta)
      if (result === undefined) return context.state
      return appendResult(context.state, result, match.event.seq)
    },
    buildViewNode: (context) => {
      const state = context.state
      const last = state?.results.at(-1)
      if (state === undefined || last === undefined) return null
      const location = context.matches.at(-1)?.location ?? context.start?.location ?? { kind: 'unresolved' }
      return {
        key: context.key,
        kind: IMAGE_RESULT_NODE_KIND,
        id: context.id,
        target: 'chat',
        // While the Turn is open the artifact stays at its own tool/result
        // position, so later messages in the same Turn order below it. Once the
        // Turn closes, Compact folds every node before the finalized answer
        // boundary, so the artifact re-anchors beside that answer to stay
        // visible; Normal mode has no folding and keeps the natural position.
        // An unknown transcript mode falls back to the Compact-safe behavior.
        anchorSeq: state.endSeq !== undefined && compactTranscript(options)
          ? state.answerSeq ?? state.endSeq ?? last.seq
          : last.seq,
        location,
        visibility: 'visible',
        data: {
          ...(state.turn !== undefined ? { turn: state.turn } : {}),
          results: state.results.map(({ seq: _seq, ...result }) => result),
        },
      }
    },
  }
}

/** Append a parsed result unless its attachment is already collected. */
function appendResult(
  state: ImageResultState,
  result: ImageResultPresentation,
  seq: number,
): ImageResultState {
  if (state.results.some(candidate => candidate.attachment.attachmentId === result.attachment.attachmentId)) {
    return state
  }
  return { ...state, results: [...state.results, { ...result, seq }] }
}

function compactTranscript(options: ImageResultNodeOptions): boolean {
  try {
    return options.isCompactTranscript?.() ?? true
  } catch {
    return true
  }
}

/** Parse the plugin-owned durable presentation metadata from a Tool result event. */
export function imageResultFromMeta(value: unknown): ImageResultPresentation | undefined {
  const meta = record(value)
  if (meta?.kind !== 'dsh-image-gen') return undefined
  const attachment = imageAttachment(meta.attachment)
  if (attachment === undefined) return undefined
  return {
    attachment,
    prompt: stringValue(meta.prompt, 'Generated Image'),
    provider: stringValue(meta.provider, 'google'),
    model: stringValue(meta.model, ''),
    output: stringValue(meta.output, ''),
    ...(typeof meta.savedTo === 'string' ? { savedTo: meta.savedTo } : {}),
    ...(typeof meta.seed === 'number' ? { seed: meta.seed } : {}),
  }
}

function eventTurn(event: EventLike): number | undefined {
  const turn = event.data.turn
  return typeof turn === 'number' && Number.isSafeInteger(turn) && turn >= 0 ? turn : undefined
}

/** Plugin tools whose PTC (run_code) dispatch results are image results. */
const PTC_IMAGE_TOOL_NAMES: ReadonlySet<string> = new Set(['generate_image', 'edit_image'])

/**
 * Fixed summary text rendered by the tools' imageOutput(). PTC dispatch events
 * carry no presentationMeta, so provider/model/output are recovered from this
 * template rather than parsed out of natural language.
 */
const PTC_SUMMARY_PATTERN = /^(?:Generated|Edited) one image with ([^/\s]+)\/(\S+) \((.+)\)\. Attachment ID: /
const PTC_SAVED_TO_PATTERN = / It was also saved to the workspace as (.+)\. (?:(?:Saving it to the workspace failed)|(?:It has no local file path)|(?:Respond to the user))/

/**
 * Parse a plugin image result from a tool/ptc-dispatch event (#38). PTC
 * run_code sub-calls carry neither a turn nor presentationMeta, so the result
 * is rebuilt from the dispatch payload itself: the image content block for the
 * attachment, arguments for the prompt (and edit source ids), and the tool's
 * fixed-format summary text for provider/model/output. Returns undefined for
 * anything that is not a successful image result from our own image tools.
 */
export function imageResultFromPtcDispatch(event: EventLike): ImageResultPresentation | undefined {
  if (event.type !== 'tool/ptc-dispatch') return undefined
  const data = event.data
  if (data.isError === true) return undefined
  if (typeof data.name !== 'string' || !PTC_IMAGE_TOOL_NAMES.has(data.name)) return undefined
  const content = Array.isArray(data.content) ? data.content : []
  let attachment: ImageAttachmentRef | undefined
  let summaryText = ''
  for (const block of content) {
    const candidate = record(block)
    if (candidate === undefined) continue
    if (candidate.type === 'image' && attachment === undefined) {
      attachment = imageAttachment(candidate.attachment)
    } else if (candidate.type === 'text' && summaryText === '' && typeof candidate.text === 'string') {
      summaryText = candidate.text
    }
  }
  if (attachment === undefined) return undefined
  const summary = PTC_SUMMARY_PATTERN.exec(summaryText)
  const savedTo = PTC_SAVED_TO_PATTERN.exec(summaryText)?.[1]
  const args = record(data.arguments)
  const sourceIds = sourceAttachmentIds(args)
  return {
    attachment,
    prompt: stringValue(args?.prompt, 'Generated Image'),
    provider: summary?.[1] ?? '',
    model: summary?.[2] ?? '',
    output: summary?.[3] ?? '',
    ...(savedTo !== undefined ? { savedTo } : {}),
    ...(sourceIds !== undefined ? { sourceAttachmentIds: sourceIds } : {}),
  }
}

/** Collect edit_image source attachment ids (single or list form) from dispatch arguments. */
function sourceAttachmentIds(args: Record<string, unknown> | undefined): readonly string[] | undefined {
  if (args === undefined) return undefined
  const single = typeof args.source_attachment_id === 'string' ? [args.source_attachment_id] : undefined
  const list = Array.isArray(args.source_attachment_ids)
    ? args.source_attachment_ids.filter((id): id is string => typeof id === 'string')
    : undefined
  const ids = single ?? list
  return ids !== undefined && ids.length > 0 ? ids : undefined
}

function imageAttachment(value: unknown): ImageAttachmentRef | undefined {
  const candidate = record(value)
  if (candidate === undefined
    || typeof candidate.attachmentId !== 'string'
    || !isImageMediaType(candidate.mediaType)
    || !positiveInteger(candidate.bytes)
    || !positiveInteger(candidate.width)
    || !positiveInteger(candidate.height)) return undefined
  const original = record(candidate.originalDimensions)
  if (candidate.originalDimensions !== undefined
    && (original === undefined || !positiveInteger(original.width) || !positiveInteger(original.height))) return undefined
  return {
    attachmentId: candidate.attachmentId as ImageAttachmentRef['attachmentId'],
    mediaType: candidate.mediaType,
    bytes: candidate.bytes,
    width: candidate.width,
    height: candidate.height,
    ...(typeof candidate.name === 'string' ? { name: candidate.name } : {}),
    ...(original === undefined ? {} : { originalDimensions: { width: original.width as number, height: original.height as number } }),
  }
}

function isImageMediaType(value: unknown): value is ImageMediaType {
  return value === 'image/png' || value === 'image/jpeg' || value === 'image/webp' || value === 'image/gif'
}

function positiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}
