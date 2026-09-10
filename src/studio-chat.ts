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
import type {} from '@deepseek-ai/dsh-agent'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-workspace'
import { CHAT_ROUTE, STUDIO_CHAT_SESSION_ID, type ChatImageRef, type StudioChatEvent } from './shared.js'

/** Wire responses for CHAT_ROUTE. */
export interface StudioChatStateResponse {
  ok: true
  latestSeq: number
  events: StudioChatEvent[]
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
  agent: {
    followup(message: unknown): void
  } | undefined
  /** Agent teardown when this plugin created the agent; reattaches have none. */
  disposeAgent: (() => void) | undefined
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
  const runtime: ChatRuntime = { events: [], latestSeq: 0, agent: undefined, disposeAgent: undefined }
  const disposers: Array<() => void> = []

  void ensureAgent(ctx, runtime).catch(error => {
    ctx.logger.warn(`dsh-image-gen: studio chat unavailable: ${error instanceof Error ? error.message : String(error)}`)
  })

  // Subscribe when the host exposes the cordis event bus; a host (or test
  // harness) without it simply never receives events and the panel degrades
  // to send-only instead of breaking plugin load.
  const subscribeEvents = typeof ctx.on === 'function'
    ? ctx.on('session/event', (session, event) => {
        if (String(session.id) !== STUDIO_CHAT_SESSION_ID) return
        const projected = projectEvent(event)
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

/** Create the dedicated agent once; reattach if the session already exists. */
async function ensureAgent(ctx: Context, runtime: ChatRuntime): Promise<void> {
  if (runtime.agent !== undefined) return
  const agents = (ctx as Context & { agents?: { get(id: string): unknown } }).agents
  if (agents === undefined) throw new Error('DSH host does not expose the agent service')

  // Reattach to an already-live session (e.g. plugin reload) instead of
  // colliding with ctx.agents.create's duplicate-id rejection.
  const existing = agents.get(STUDIO_CHAT_SESSION_ID)
  if (existing !== undefined) {
    runtime.agent = existing as ChatRuntime['agent']
    await archiveQuietly(ctx)
    return
  }

  const handle = await ctx.agents.create({
    sessionId: STUDIO_CHAT_SESSION_ID as SessionId,
    meta: { cwd: process.cwd() },
  })
  runtime.agent = handle.agent
  // Teardown runs through the runtime disposer (not ctx.effect) because this
  // registration happens after apply's synchronous section; disposal failures
  // are logged, never thrown.
  runtime.disposeAgent = () => {
    void handle.dispose().catch(error => {
      ctx.logger.warn(`dsh-image-gen: studio chat agent dispose failed: ${error instanceof Error ? error.message : String(error)}`)
    })
  }
  await archiveQuietly(ctx)
}

/** Archive the session out of every sidebar grouping surface; never fatal. */
async function archiveQuietly(ctx: Context): Promise<void> {
  try {
    await ctx.workspaceRegistry.archiveSession(STUDIO_CHAT_SESSION_ID as SessionId)
  } catch (error) {
    ctx.logger.warn(`dsh-image-gen: studio chat archive skipped: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/** Project one raw session event into the browser feed, or undefined to skip. */
function projectEvent(event: unknown): StudioChatEvent | undefined {
  const raw = event as { type?: string; seq?: number; data?: Record<string, unknown> }
  if (typeof raw.type !== 'string' || typeof raw.seq !== 'number') return undefined
  const seq = raw.seq
  const data = raw.data ?? {}

  switch (raw.type) {
    case 'user/message': {
      const text = textOf((data as { message?: { content?: unknown[] } }).message?.content)
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
    case 'tool/result': {
      const images = imagesFromToolResult(data)
      const name = typeof (data as { toolName?: unknown }).toolName === 'string'
        ? String((data as { toolName?: unknown }).toolName)
        : 'tool'
      const ok = !('error' in data) || data.error === undefined || data.error === null
      return { seq, type: 'tool', name, ok, images }
    }
    case 'turn/start':
      return { seq, type: 'status', phase: 'turn-start' }
    case 'turn/end': {
      const reason = (data as { reason?: unknown }).reason
      return {
        seq,
        type: 'status',
        phase: 'turn-end',
        ...(typeof reason === 'string' ? { reason } : {}),
      }
    }
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
  json(res, 200, { ok: true, latestSeq: runtime.latestSeq, events } satisfies StudioChatStateResponse)
}

/** POST handler: validate the text and submit one follow-up turn. */
async function serveSend(
  ctx: Context,
  runtime: ChatRuntime,
  deps: StudioChatDeps,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (runtime.agent === undefined) return jsonError(res, 503, 'chat-unavailable')
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
    })
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
