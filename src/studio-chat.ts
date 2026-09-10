/**
 * Dedicated DSH agent session backing the workbench chat panel.
 *
 * The panel is a real DSH conversation driven from the plugin, not a parallel
 * chat implementation: on first use the host creates an agent through
 * ctx.agents.create (the same factory the sidebar uses), then archives the
 * session through ctx.workspaceRegistry so it never appears in the sidebar
 * history list while remaining fully usable. The plugin never calls
 * sessions.open - archiving the selected session would clear the user's
 * current selection - and drives turns purely through agent.followup().
 *
 * Session events are projected into a small lossless-enough StudioChatEvent
 * feed (text turns, tool summaries, generated-image references) and served to
 * the browser through CHAT_ROUTE. The browser pulls increments with
 * ?since=<seq>; images land on the tldraw canvas from the browser side via
 * the existing IMAGE_ROUTE + landing-queue path.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent, AgentHandle, AgentOptions, AgentRegistry } from '@deepseek-ai/dsh-agent'
import type { SessionId, UserMessage } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-workspace'
import { CHAT_ROUTE, STUDIO_CHAT_SESSION_ID, type ChatImageRef, type StudioChatEvent } from './shared.js'

/** Wire responses for CHAT_ROUTE. */
export interface StudioChatStateResponse {
  ok: true
  latestSeq: number
  events: StudioChatEvent[]
  /** Why the backing agent is missing, when creation failed; absent otherwise. */
  unavailable?: string
}
export interface StudioChatSendResponse {
  ok: true
}
export interface StudioChatErrorResponse {
  error: string
}

/** Hard cap for the projected feed; older events drop off silently. */
const MAX_PROJECTED_EVENTS = 400
/** Hard cap for one submitted prompt. */
const MAX_PROMPT_CHARS = 8_000

interface ChatRuntime {
  /** Projected events in seq order (monotonic; ring semantics). */
  events: StudioChatEvent[]
  /** Highest projected seq (0 before the first event). */
  latestSeq: number
  /** Live agent handle fields the send path needs; undefined until created. */
  agent: Agent | undefined
  /** Agent teardown when this plugin created the agent; reattaches have none. */
  disposeAgent: (() => void) | undefined
  /**
   * toolCallId → tool name, learned from tool/call events so tool/result rows
   * can show the model's chosen name (the result event carries no name).
   */
  toolNames: Map<string, string>
  /** Why the agent could not be created; surfaced through GET and POST. */
  unavailable: string | undefined
}

export interface StudioChatDeps {
  maxBodyBytes: number
}

/**
 * Install the studio chat: ensure the dedicated agent session, subscribe to
 * its events, and return the CHAT_ROUTE handler plus a disposer. Creation
 * failures never break the plugin load - the route reports the error and the
 * panel shows it, so a host without agent services degrades visibly instead
 * of fatally.
 */
export function createStudioChat(ctx: Context, deps: StudioChatDeps): {
  serve: (req: IncomingMessage, res: ServerResponse) => Promise<void>
  dispose(): void
} {
  const runtime: ChatRuntime = { events: [], latestSeq: 0, agent: undefined, disposeAgent: undefined, toolNames: new Map(), unavailable: undefined }
  const disposers: Array<() => void> = []

  // Agent-creation failures land here once and are replayed to the browser
  // through the GET feed and POST error bodies, so the panel can explain why
  // chat is unavailable instead of only logging to the host console.
  const ensure = async (target: Context): Promise<void> => {
    try {
      await ensureAgent(target, runtime)
      runtime.unavailable = undefined
    } catch (error) {
      runtime.unavailable = error instanceof Error && error.message.length > 0
        ? error.message
        : 'agent unavailable'
      ctx.logger.warn(`dsh-image-gen: studio chat unavailable: ${runtime.unavailable}`)
    }
  }

  // Dynamic service injection (optional-dependency pattern): the callback
  // fires once the agent registry, the workspace registry, and the default
  // model config are live, and receives a scoped context whose fiber declared
  // exactly those services. Service reads MUST go through that scoped
  // context: on any other context cordis throws
  // `cannot get property "agents" without inject` instead of resolving.
  if (typeof ctx.inject === 'function') {
    const injectServices = ctx.inject as unknown as (
      deps: readonly string[],
      callback: (owner: Context) => void,
    ) => unknown
    const fiber = injectServices(['agents', 'workspaceRegistry', 'agentDefaultModel'], (scoped: Context) => {
      void ensure(scoped)
    })
    const disposeFiber = (fiber as { dispose?: () => void } | null | undefined)?.dispose
    if (typeof disposeFiber === 'function') disposers.push(disposeFiber.bind(fiber))
  } else {
    // Plain-cordis harness without the inject API: try immediately; the
    // ensureAgent guards report the missing services through the route.
    void ensure(ctx)
  }

  // Subscribe when the host exposes the cordis event bus; a host (or test
  // harness) without it simply never receives events and the panel degrades
  // to send-only instead of breaking plugin load.
  const subscribeEvents = typeof ctx.on === 'function'
    ? ctx.on('session/event', (session, event) => {
        if (String(session.id) !== STUDIO_CHAT_SESSION_ID) return
        const projected = projectEvent(runtime, event)
        if (projected !== undefined) appendEvent(runtime, projected)
      })
    : undefined
  if (typeof subscribeEvents === 'function') disposers.push(subscribeEvents)

  return {
    serve: (req, res) => serveChat(ctx, runtime, deps, req, res),
    dispose: () => {
      for (const dispose of disposers.splice(0, disposers.length)) dispose()
      runtime.disposeAgent?.()
      runtime.agent = undefined
    },
  }
}

/** Create the dedicated agent once; reattach live, resume persisted, else create. */
async function ensureAgent(ctx: Context, runtime: ChatRuntime): Promise<void> {
  if (runtime.agent !== undefined) return
  const agents = (ctx as Context & { agents?: AgentRegistry }).agents
  if (agents === undefined) throw new Error('DSH host does not expose the agent service')

  // Entry points like the sidebar pass the host's default model when creating
  // agents; without it the agent has no model and prompt assembly fails every
  // turn with `prompt variable "{{model}}" has no value`. Resolve the same
  // selection for our session; an explicitly empty selection is a hard error
  // because no turn could ever run, while a missing service falls through so
  // hosts that wire defaults differently keep working.
  const agentOptions = defaultModelOptionsOf(ctx)
  if (agentOptions === CONFIGURED_EMPTY_MODEL) {
    throw new Error('no default model configured in DSH settings; pick one first')
  }

  // Live re-attach: the host kept running across a plugin reload, so the
  // session is already in the registry (the same handle the sidebar factory
  // would return). No duplicate-id collision with create, and its model
  // selection already exists - do not disturb it.
  const existing = agents.get(STUDIO_CHAT_SESSION_ID as SessionId)
  if (existing !== undefined) {
    runtime.agent = existing
    await archiveQuietly(ctx)
    return
  }

  // Restart path: the session is persisted but not live. resume() loads the
  // durable conversation so the agent keeps its memory across DSH restarts;
  // it rejects when nothing is persisted, which is the first-use case below.
  try {
    const resumed = await agents.resume({
      resumeSessionId: STUDIO_CHAT_SESSION_ID as SessionId,
      ...(agentOptions !== undefined ? { agentOptions } : {}),
    })
    runtime.agent = resumed.agent
    bindAgentDisposer(ctx, runtime, resumed)
    await archiveQuietly(ctx)
    return
  } catch {
    // Not persisted either - first use, fall through to create.
  }

  const handle = await agents.create({
    sessionId: STUDIO_CHAT_SESSION_ID as SessionId,
    meta: { cwd: process.cwd() },
    ...(agentOptions !== undefined ? { agentOptions } : {}),
  })
  runtime.agent = handle.agent
  bindAgentDisposer(ctx, runtime, handle)
  await archiveQuietly(ctx)
}

/**
 * Structural type for ctx.agentDefaultModel (dsh-agent-default-model): the
 * host-owned default model selection backing new sidebar conversations.
 * Kept local so the package stays a type-only convenience, not a dependency.
 */
interface AgentDefaultModelService {
  currentSelection(): { provider: string; model: string; reasoningEffort?: string }
}

/** Sentinel: the service exists but has no usable selection configured. */
const CONFIGURED_EMPTY_MODEL = Symbol('configured-empty-model')

/**
 * Resolve the host's default model into create/resume agentOptions.
 * Returns the provider/model pair, CONFIGURED_EMPTY_MODEL when the host
 * exposes the service with nothing configured (a guaranteed broken agent),
 * or undefined when the service is absent (let the host's own wiring decide).
 */
function defaultModelOptionsOf(ctx: Context): { provider: string; model: string } | typeof CONFIGURED_EMPTY_MODEL | undefined {
  const service = (ctx as Context & { agentDefaultModel?: AgentDefaultModelService }).agentDefaultModel
  if (service === undefined || typeof service.currentSelection !== 'function') return undefined
  let selection: { provider: string; model: string } | undefined
  try {
    selection = service.currentSelection()
  } catch {
    return undefined
  }
  if (typeof selection?.provider !== 'string' || typeof selection?.model !== 'string') return undefined
  if (selection.provider.trim().length === 0 || selection.model.trim().length === 0) return CONFIGURED_EMPTY_MODEL
  return { provider: selection.provider, model: selection.model }
}

/** Attach handle teardown to the runtime disposer; disposal failures are logged, never thrown. */
function bindAgentDisposer(ctx: Context, runtime: ChatRuntime, handle: AgentHandle): void {
  // Teardown runs through the runtime disposer (not ctx.effect) because this
  // registration happens after apply's synchronous section.
  runtime.disposeAgent = () => {
    void handle.dispose().catch(error => {
      ctx.logger.warn(`dsh-image-gen: studio chat agent dispose failed: ${error instanceof Error ? error.message : String(error)}`)
    })
  }
}

/** Archive the session out of every sidebar grouping surface; never fatal. */
async function archiveQuietly(ctx: Context): Promise<void> {
  try {
    await ctx.workspaceRegistry.archiveSession(STUDIO_CHAT_SESSION_ID as SessionId)
  } catch (error) {
    ctx.logger.warn(`dsh-image-gen: studio chat archive skipped: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * Project one raw session event into the browser feed, or undefined to skip.
 *
 * Field paths verified against dsh-session's SessionEventMap: 'user/message'
 * data IS the UserMessage itself (content at `data.content`), while
 * 'assistant/message' and 'tool/result' wrap theirs in `data.message`.
 * 'tool/call' data carries the model-chosen `name` and `callId`; the result
 * event never repeats the name, so the runtime's toolNames map closes the gap.
 */
function projectEvent(runtime: ChatRuntime, event: unknown): StudioChatEvent | undefined {
  const raw = event as { type?: string; seq?: number; data?: Record<string, unknown> }
  if (typeof raw.type !== 'string' || typeof raw.seq !== 'number') return undefined
  const seq = raw.seq
  const data = raw.data ?? {}

  switch (raw.type) {
    case 'user/message': {
      // Only direct human prompts render; synthetic agent.inject() contexts
      // and goal continuations share this event type but carry other sources.
      const source = (data as { source?: { kind?: unknown } }).source
      if (source?.kind !== 'user') return undefined
      const text = textOf((data as { content?: unknown[] }).content)
      if (text === '') return undefined
      return { seq, type: 'user', text }
    }
    case 'assistant/message': {
      const message = (data as { message?: { content?: unknown[] } }).message
      const text = textOf(message?.content)
      if (text === '') return undefined
      const interrupted = (data as { interrupted?: boolean }).interrupted === true
      return interrupted ? { seq, type: 'assistant', text, interrupted } : { seq, type: 'assistant', text }
    }
    case 'tool/call': {
      const callId = (data as { callId?: unknown }).callId
      const name = (data as { name?: unknown }).name
      if (typeof callId === 'string' && typeof name === 'string') runtime.toolNames.set(callId, name)
      return undefined
    }
    case 'tool/result': {
      const images = imagesFromToolResult(data)
      const block = firstToolResultBlock(data)
      const name = block !== undefined
        ? runtime.toolNames.get(block.toolCallId) ?? 'tool'
        : 'tool'
      const ok = data.error === undefined || data.error === null
      return { seq, type: 'tool', name, ok, images }
    }
    case 'turn/start':
      return { seq, type: 'status', phase: 'turn-start' }
    case 'turn/end': {
      const detail = turnEndDetail((data as { reason?: unknown }).reason)
      return detail === undefined
        ? { seq, type: 'status', phase: 'turn-end' }
        : { seq, type: 'status', phase: 'turn-end', detail }
    }
    default:
      return undefined
  }
}

/** The toolCallId of a tool/result's single ToolResultBlock, if present. */
function firstToolResultBlock(data: Record<string, unknown>): { toolCallId: string } | undefined {
  const content = (data as { message?: { content?: unknown[] } }).message?.content
  if (!Array.isArray(content) || content.length === 0) return undefined
  const block = content[0]
  if (typeof block !== 'object' || block === null) return undefined
  const candidate = block as { type?: unknown; toolCallId?: unknown }
  if (candidate.type !== 'tool-result' || typeof candidate.toolCallId !== 'string') return undefined
  return { toolCallId: candidate.toolCallId }
}

/**
 * Render the structured TurnEndReason into a short panel-visible ending.
 * Clean completions (and unknown shapes) stay silent; only error, abort,
 * block, max-tokens, and crash-interrupted turns surface a detail row.
 */
function turnEndDetail(reason: unknown): string | undefined {
  if (typeof reason !== 'object' || reason === null) return undefined
  const kind = (reason as { kind?: unknown }).kind
  switch (kind) {
    case 'completed':
      return undefined
    case 'error': {
      const error = (reason as { error?: { message?: unknown; code?: unknown } }).error
      const message = typeof error?.message === 'string' ? error.message : ''
      return message.length > 0 ? message : 'turn failed'
    }
    case 'aborted': {
      const cause = (reason as { reason?: unknown }).reason
      const text = typeof cause === 'string' ? cause : typeof cause === 'object' && cause !== null && 'message' in (cause as Record<string, unknown>) ? String((cause as { message?: unknown }).message ?? '') : ''
      return text.length > 0 ? text : 'turn aborted'
    }
    case 'blocked':
      return 'turn blocked'
    case 'max-tokens':
      return 'output token ceiling reached'
    case 'interrupted':
      return 'turn interrupted by reload'
    default:
      return undefined
  }
}

/** Concatenate the text blocks of a message content list. */
function textOf(content: unknown[] | undefined): string {
  if (!Array.isArray(content)) return ''
  let text = ''
  for (const block of content) {
    if (typeof block === 'object' && block !== null) {
      const candidate = block as { type?: unknown; text?: unknown }
      if (candidate.type === 'text' && typeof candidate.text === 'string') text += candidate.text
    }
  }
  return text.trim()
}

/**
 * Extract generated-image references from a tool/result event. The plugin's
 * own tools attach presentation meta (kind 'dsh-image-gen' plus attachment
 * fields) to the event; that meta is the only trusted source, so foreign
 * tools produce an empty image list and render as plain tool rows.
 */
function imagesFromToolResult(data: Record<string, unknown>): ChatImageRef[] {
  const meta = data.meta
  if (typeof meta !== 'object' || meta === null) return []
  const record = meta as Record<string, unknown>
  if (record.kind !== 'dsh-image-gen') return []
  const attachment = record.attachment
  if (typeof attachment !== 'object' || attachment === null) return []
  const ref = attachment as Record<string, unknown>
  if (typeof ref.attachmentId !== 'string' || typeof ref.mediaType !== 'string') return []
  // IMAGE_ROUTE validates bytes/width/height as positive integers; without
  // them the browser cannot fetch the blob, so the whole reference is dropped
  // instead of rendering an unfetchable thumbnail.
  if (!positiveInt(ref.bytes) || !positiveInt(ref.width) || !positiveInt(ref.height)) return []
  const image: ChatImageRef = {
    attachmentId: ref.attachmentId,
    mediaType: ref.mediaType,
    bytes: ref.bytes,
    width: ref.width,
    height: ref.height,
    ...(typeof ref.name === 'string' ? { name: ref.name } : {}),
    ...(typeof record.provider === 'string' ? { provider: record.provider } : {}),
    ...(typeof record.model === 'string' ? { model: record.model } : {}),
    ...(typeof record.prompt === 'string' ? { prompt: record.prompt } : {}),
  }
  return [image]
}

function positiveInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
}

/** Append with ring semantics; the seq watermark moves even when dropping. */
function appendEvent(runtime: ChatRuntime, event: StudioChatEvent): void {
  runtime.events.push(event)
  if (runtime.events.length > MAX_PROJECTED_EVENTS) {
    runtime.events.splice(0, runtime.events.length - MAX_PROJECTED_EVENTS)
  }
  runtime.latestSeq = event.seq
}

/** Serve CHAT_ROUTE: GET (feed increments) and POST (submit a user turn). */
async function serveChat(
  ctx: Context,
  runtime: ChatRuntime,
  deps: StudioChatDeps,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (!sameOrigin(req)) return jsonError(res, 403, 'origin-rejected')
  try {
    if (req.method === 'GET') return serveFeed(runtime, req, res)
    if (req.method === 'POST') return await serveSend(ctx, runtime, deps, req, res)
    return jsonError(res, 405, 'method-not-allowed')
  } catch (error) {
    return jsonError(res, 500, error instanceof Error && error.message.length > 0 ? error.message : 'chat-failed')
  }
}

/** GET handler: project the feed since the requested seq. */
function serveFeed(runtime: ChatRuntime, req: IncomingMessage, res: ServerResponse): void {
  const url = new URL(req.url ?? CHAT_ROUTE, 'http://localhost')
  const sinceRaw = url.searchParams.get('since')
  const since = sinceRaw !== null && /^\d+$/.test(sinceRaw) ? Number(sinceRaw) : 0
  const events = runtime.events.filter(event => event.seq > since)
  json(res, 200, {
    ok: true,
    latestSeq: runtime.latestSeq,
    events,
    ...(runtime.agent === undefined && runtime.unavailable !== undefined ? { unavailable: runtime.unavailable } : {}),
  } satisfies StudioChatStateResponse)
}

/** POST handler: validate the text and submit one follow-up turn. */
async function serveSend(
  ctx: Context,
  runtime: ChatRuntime,
  deps: StudioChatDeps,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (runtime.agent === undefined) {
    return jsonError(res, 503, runtime.unavailable !== undefined ? `chat-unavailable: ${runtime.unavailable}` : 'chat-unavailable')
  }
  if (!(req.headers['content-type'] ?? '').toLowerCase().startsWith('application/json')) {
    return jsonError(res, 415, 'json-required')
  }
  let body: unknown
  try {
    body = JSON.parse(await readBody(req, deps.maxBodyBytes))
  } catch {
    return jsonError(res, 400, 'invalid-request')
  }
  const text = typeof (body as { text?: unknown })?.text === 'string' ? (body as { text: string }).text.trim() : ''
  if (text.length === 0) return jsonError(res, 400, 'empty-prompt')
  if (text.length > MAX_PROMPT_CHARS) return jsonError(res, 400, `prompt-too-long: ${String(MAX_PROMPT_CHARS)}`)

  try {
    // followup queues one ordinary turn and wakes the driver; the projected
    // user/message event lands in the feed through the session/event listener,
    // so the browser stays the single source of rendering truth.
    runtime.agent.followup({
      id: `dsh-image-gen-studio-${Date.now()}-${Math.floor(Math.random() * 1e9)}`,
      role: 'user',
      content: [{ type: 'text', text }],
      source: { kind: 'user' },
    } as UserMessage)
  } catch (error) {
    ctx.logger.warn(`dsh-image-gen: chat send failed: ${error instanceof Error ? error.message : String(error)}`)
    return jsonError(res, 502, 'send-failed')
  }
  json(res, 200, { ok: true } satisfies StudioChatSendResponse)
}

async function readBody(req: IncomingMessage, maxBytes: number): Promise<string> {
  const chunks: Buffer[] = []
  let bytes = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    bytes += buffer.byteLength
    if (bytes > maxBytes) throw new Error('payload-too-large')
    chunks.push(buffer)
  }
  return Buffer.concat(chunks).toString('utf8')
}

function sameOrigin(req: IncomingMessage): boolean {
  const origin = req.headers.origin
  const host = req.headers.host
  return origin === undefined || host === undefined || origin === `http://${host}` || origin === `https://${host}`
}

function json(res: ServerResponse, status: number, value: unknown): void {
  if (res.headersSent || res.writableEnded || res.destroyed) return
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(value))
}

function jsonError(res: ServerResponse, status: number, message: string): void {
  json(res, status, { error: message } satisfies StudioChatErrorResponse)
}
