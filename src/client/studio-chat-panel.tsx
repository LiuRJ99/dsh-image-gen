/**
 * Workbench chat panel: the right-side DSH conversation surface.
 *
 * A dedicated archived agent session lives on the host side (studio-chat.ts);
 * this panel pulls its projected event feed through CHAT_ROUTE with adaptive
 * polling (?since=<seq> increments; faster while a turn is running, slower
 * when idle, paused while the webview is hidden) and submits user turns with
 * POST. Tool-generated images are mirrored onto the tldraw canvas through the
 * landing queue and upserted into the gallery (the recent list refreshes via
 * its subscription). The panel is intentionally unmount-friendly: re-pulls
 * from seq 0 on remount, and both landing and gallery writes are deduped by
 * attachmentId, so tab switches are safe.
 */
import { useCallback, useEffect, useRef, useState, type FC, type KeyboardEvent } from 'react'
import type { ImageAttachmentRef, ImageMediaType } from '@deepseek-ai/dsh-attachment'
import { Check, LoaderCircle, Send, Sparkles, Wrench, X } from 'lucide-react'
import { CHAT_ROUTE, IMAGE_PROVIDERS, STUDIO_CHAT_SESSION_ID, type ChatImageRef, type ImageProvider, type StudioChatEvent } from '../shared.js'
import { saveGalleryItem, type GalleryItem } from './gallery-store.js'
import { fetchAttachmentBlob } from './image-cache.js'
import { pushTlLandings } from './tl/tl-canvas-bridge.js'

const POLL_IDLE_MS = 4_000
const POLL_BUSY_MS = 1_000
/** Rendered event cap; older rows drop off the top of the list. */
const MAX_RENDERED_EVENTS = 300
/** Prompt cap mirrors the host-side POST validation. */
const MAX_PROMPT_CHARS = 8_000

const CHAT_COPY = {
  zh: {
    placeholder: '描述你想生成的图片，例如“画一只戴宇航头盔的橘猫，水彩风”…（Ctrl+Enter 发送）',
    send: '发送',
    thinking: '正在思考…',
    empty: '和智能体对话生成图片。生成结果会自动落到无限画布和左侧“最近生成”。',
    toolOk: '已完成',
    toolFailed: '失败',
    imagesSuffix: '{n} 张图',
    sendFailed: '发送失败，请稍后重试',
    feedError: '对话服务暂不可用：{reason}',
    interrupted: '（已被中断）',
  },
  en: {
    placeholder: 'Describe the image you want, e.g. "an orange cat in an astronaut helmet, watercolor"… (Ctrl+Enter to send)',
    send: 'Send',
    thinking: 'Thinking…',
    empty: 'Chat with the agent to generate images. Results land on the infinite canvas and the recent list automatically.',
    toolOk: 'done',
    toolFailed: 'failed',
    imagesSuffix: '{n} image(s)',
    sendFailed: 'Send failed, please retry.',
    feedError: 'Chat unavailable: {reason}',
    interrupted: '(interrupted)',
  },
} as const

type ChatCopyKey = keyof typeof CHAT_COPY.zh

/** Workspace scoping mirrored onto gallery records; shape-compatible with StudioWorkspaceProps. */
export interface ChatWorkspaceScope {
  workspaceId?: string | undefined
  path?: string | undefined
}

export const StudioChatPanel: FC<{
  lang: 'zh' | 'en'
  workspace?: ChatWorkspaceScope | null | undefined
}> = ({ lang, workspace }) => {
  const [events, setEvents] = useState<StudioChatEvent[]>([])
  const [busy, setBusy] = useState(false)
  const [feedError, setFeedError] = useState<string | null>(null)
  const [sendError, setSendError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [input, setInput] = useState('')

  const busyRef = useRef(false)
  const sendingRef = useRef(false)
  const workspaceRef = useRef(workspace)
  workspaceRef.current = workspace
  const pollRef = useRef<{ pull(): Promise<void> } | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const pinnedRef = useRef(true)

  const t = (key: ChatCopyKey, values?: Record<string, string>): string => {
    let text: string = CHAT_COPY[lang][key]
    for (const [name, value] of Object.entries(values ?? {})) text = text.replace(`{${name}}`, value)
    return text
  }

  // Mirror one tool event's images onto the tldraw canvas and into the
  // gallery. Both paths are idempotent (queue dedupe + upsert), so repeated
  // pulls of the same event are harmless.
  const landImages = useCallback((images: readonly ChatImageRef[]): void => {
    if (images.length === 0) return
    pushTlLandings(images.map(image => ({ galleryId: String(image.attachmentId), attachment: attachmentOf(image) })))
    for (const image of images) {
      const provider = (IMAGE_PROVIDERS as readonly string[]).includes(image.provider ?? '')
        ? image.provider as ImageProvider
        : undefined
      if (provider === undefined) {
        // Canvas still gets the image; only the gallery record is skipped.
        console.warn('[dsh-image-gen] chat image skipped from gallery (unknown provider):', image.provider)
        continue
      }
      const scope = workspaceRef.current
      const entry: GalleryItem = {
        id: String(image.attachmentId),
        attachment: attachmentOf(image),
        prompt: image.prompt ?? '',
        provider,
        model: image.model ?? '',
        createdAt: Date.now(),
        ...(scope?.path !== undefined && scope.path.trim().length > 0 ? { workspacePath: scope.path } : {}),
        ...(scope?.workspaceId !== undefined && scope.workspaceId.trim().length > 0 ? { workspaceId: scope.workspaceId } : {}),
        sessionId: STUDIO_CHAT_SESSION_ID,
      }
      void saveGalleryItem(entry).catch(error => {
        console.warn('[dsh-image-gen] chat gallery upsert failed:', error)
      })
    }
  }, [])

  // Adaptive polling loop: mounted once for the panel's lifetime.
  useEffect(() => {
    let disposed = false
    let timer: ReturnType<typeof setTimeout> | null = null
    let since = 0

    const pull = async (): Promise<void> => {
      if (disposed) return
      try {
        const response = await fetch(`${CHAT_ROUTE}?since=${since}`, { credentials: 'same-origin' })
        if (disposed) return
        const payload = await response.json() as { ok?: boolean; latestSeq?: number; events?: StudioChatEvent[]; error?: string }
        if (disposed) return
        if (!response.ok || payload.error !== undefined || !Array.isArray(payload.events)) {
          setFeedError(t('feedError', { reason: payload.error ?? `HTTP ${response.status}` }))
          return
        }
        setFeedError(null)
        since = typeof payload.latestSeq === 'number' ? payload.latestSeq : since
        const incoming = payload.events
        if (incoming.length === 0) return

        // Derive the busy flag from the last status event of this batch.
        let nextBusy = busyRef.current
        for (const event of incoming) {
          if (event.type === 'status') nextBusy = event.phase === 'turn-start'
        }
        busyRef.current = nextBusy
        setBusy(nextBusy)

        for (const event of incoming) {
          if (event.type === 'tool') landImages(event.images)
        }

        setEvents(prev => {
          const known = new Set(prev.map(event => event.seq))
          const next = prev.concat(incoming.filter(event => !known.has(event.seq)))
          return next.length > MAX_RENDERED_EVENTS ? next.slice(next.length - MAX_RENDERED_EVENTS) : next
        })
      } catch {
        if (!disposed) setFeedError(t('feedError', { reason: 'network' }))
      }
    }

    const schedule = (): void => {
      timer = setTimeout(() => { void tick() }, busyRef.current ? POLL_BUSY_MS : POLL_IDLE_MS)
    }
    const tick = async (): Promise<void> => {
      if (disposed) return
      // Hidden webview: skip the request but keep the loop alive.
      if (document.visibilityState !== 'hidden') await pull()
      schedule()
    }

    pollRef.current = { pull }
    void tick()

    const onVisibility = (): void => {
      if (document.visibilityState === 'visible') void pull()
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      disposed = true
      pollRef.current = null
      if (timer !== null) clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
    // eslint-disable-next-line react-hooks/exhaust-deps -- t closes over lang; locale switches remount enough through re-render, and stale lang only affects error strings.
  }, [landImages])

  // Keep the list pinned to the bottom while the user has not scrolled up.
  useEffect(() => {
    if (!pinnedRef.current) return
    const el = scrollRef.current
    if (el !== null) el.scrollTop = el.scrollHeight
  }, [events, busy])

  const submit = useCallback(async (): Promise<void> => {
    const text = input.trim()
    if (text.length === 0 || sendingRef.current) return
    if (text.length > MAX_PROMPT_CHARS) {
      setSendError(t('sendFailed'))
      return
    }
    sendingRef.current = true
    setSending(true)
    setSendError(null)
    try {
      const response = await fetch(CHAT_ROUTE, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: string } | null
        throw new Error(payload?.error ?? `HTTP ${response.status}`)
      }
      setInput('')
      // Show the user turn immediately instead of waiting for the next tick.
      void pollRef.current?.pull()
    } catch (error) {
      setSendError(`${t('sendFailed')} (${error instanceof Error ? error.message : String(error)})`)
    } finally {
      sendingRef.current = false
      setSending(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- input is read at call time on purpose.
  }, [input])

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault()
      void submit()
    }
  }

  const hasContent = events.length > 0 || busy

  return (
    <div className="dsh-ig-chat">
      <div
        className="dsh-ig-chat-scroll"
        ref={scrollRef}
        onScroll={() => {
          const el = scrollRef.current
          if (el === null) return
          pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60
        }}
      >
        {feedError !== null && <div className="dsh-ig-chat-error">{feedError}</div>}
        {!hasContent && feedError === null && (
          <div className="dsh-ig-chat-empty">
            <Sparkles size={22} />
            <span>{t('empty')}</span>
          </div>
        )}
        {events.map(event => <ChatRow key={event.seq} event={event} lang={lang} />)}
        {busy && (
          <div className="dsh-ig-chat-typing">
            <LoaderCircle className="dsh-ig-spin" size={13} />
            <span>{t('thinking')}</span>
          </div>
        )}
      </div>

      <form
        className="dsh-ig-chat-input"
        onSubmit={event => {
          event.preventDefault()
          void submit()
        }}
      >
        <textarea
          rows={3}
          value={input}
          placeholder={t('placeholder')}
          onChange={event => setInput(event.target.value)}
          onKeyDown={onKeyDown}
          disabled={sending}
        />
        <button type="submit" disabled={input.trim().length === 0 || sending} title={t('send')}>
          {sending ? <LoaderCircle className="dsh-ig-spin" size={15} /> : <Send size={15} />}
          <span>{t('send')}</span>
        </button>
        {sendError !== null && <div className="dsh-ig-chat-error is-inline">{sendError}</div>}
      </form>
    </div>
  )
}

/** Rendered rows: user (right bubble), assistant (left bubble), tool (summary card). */
const ChatRow: FC<{ event: StudioChatEvent; lang: 'zh' | 'en' }> = ({ event, lang }) => {
  if (event.type === 'status') return null
  if (event.type === 'user') {
    return (
      <div className="dsh-ig-chat-row is-user">
        <div className="dsh-ig-chat-bubble">{event.text}</div>
      </div>
    )
  }
  if (event.type === 'assistant') {
    return (
      <div className="dsh-ig-chat-row">
        <div className="dsh-ig-chat-bubble">
          {event.text}
          {event.interrupted === true && <em>{lang === 'zh' ? '（已被中断）' : '(interrupted)'}</em>}
        </div>
      </div>
    )
  }
  return <ToolRow event={event} lang={lang} />
}

const ToolRow: FC<{ event: Extract<StudioChatEvent, { type: 'tool' }>; lang: 'zh' | 'en' }> = ({ event, lang }) => {
  const label = lang === 'zh' ? (event.ok ? '已完成' : '失败') : (event.ok ? 'done' : 'failed')
  return (
    <div className={`dsh-ig-chat-row is-tool ${event.ok ? '' : 'is-failed'}`}>
      <div className="dsh-ig-chat-tool">
        <span className="dsh-ig-chat-tool-name">
          {event.ok ? <Check size={12} /> : <X size={12} />}
          <code>{event.name}</code>
        </span>
        <small>{label}</small>
        {event.images.length > 0 && (
          <div className="dsh-ig-chat-thumbs">
            {event.images.map(image => <ChatThumb key={image.attachmentId} image={image} />)}
          </div>
        )}
      </div>
    </div>
  )
}

/** One generated-image thumbnail, fetched through IMAGE_ROUTE. */
const ChatThumb: FC<{ image: ChatImageRef }> = ({ image }) => {
  const [url, setUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const attachment = attachmentOf(image)
  useEffect(() => {
    let cancelled = false
    let objectUrl: string | null = null
    setLoading(true)
    setUrl(null)
    fetchAttachmentBlob(attachment)
      .then(blob => {
        if (cancelled) return
        objectUrl = URL.createObjectURL(blob)
        setUrl(objectUrl)
        setLoading(false)
      })
      .catch(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
      if (objectUrl !== null) URL.revokeObjectURL(objectUrl)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- attachment is derived 1:1 from image.attachmentId.
  }, [image.attachmentId])

  const title = `${image.provider ?? ''}${image.model !== undefined ? ` · ${image.model}` : ''}${image.width > 0 ? ` · ${image.width}×${image.height}` : ''}`
  return (
    <span className="dsh-ig-chat-thumb" title={title}>
      {url !== null
        ? <img src={url} alt={image.prompt ?? ''} draggable={false} />
        : loading
          ? <LoaderCircle className="dsh-ig-spin" size={14} />
          : <Wrench size={14} />}
    </span>
  )
}

/** Build the browser-side ImageAttachmentRef from the projected ChatImageRef. */
function attachmentOf(image: ChatImageRef): ImageAttachmentRef {
  return {
    attachmentId: image.attachmentId as ImageAttachmentRef['attachmentId'],
    mediaType: image.mediaType as ImageMediaType,
    bytes: image.bytes,
    width: image.width,
    height: image.height,
    ...(image.name !== undefined ? { name: image.name } : {}),
  }
}
