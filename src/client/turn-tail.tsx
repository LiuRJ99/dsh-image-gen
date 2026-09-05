/**
 * Turn-tail deliverable representation for generated images.
 * Renders directly at the tail of the closing assistant message,
 * outside of the collapsed Turn Process.
 */
import { useEffect, useState, type MouseEvent } from 'react'
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import {
  IMAGE_ROUTE,
  imageAttachmentFromMeta,
} from '../shared.js'
import { galleryEngineLabel, normalizeGalleryItem, saveGalleryItem } from './gallery-store.js'
import { copyImageBlob, type LocaleService } from './gallery-view.js'

export interface GeneratedImageDeliverable {
  seq: number
  callId: string
  attachment: ImageAttachmentRef
  prompt: string
  engine: unknown
  savedTo?: string | undefined
  createdAt?: number | undefined
}

export interface ImageDeliverablesState {
  turn: number
  calls: Map<string, { prompt?: string | undefined }>
  images: GeneratedImageDeliverable[]
}

export const IMAGE_DELIVERABLES_KIND = 'image-generation-deliverables'

/** Pure conversation definition accumulating generated images for the turn. */
export const imageDeliverablesDefinition = {
  kind: IMAGE_DELIVERABLES_KIND,
  match: (event: { type: string; data?: { turn?: number } }) => {
    if (event.type === 'turn/start' && event.data?.turn !== undefined) {
      return { id: String(event.data.turn), role: 'start' as const }
    }
    if (event.type === 'tool/call' && event.data?.turn !== undefined) {
      return { id: String(event.data.turn), role: 'update' as const }
    }
    if (event.type === 'tool/result' && (event as { surfaceOp?: unknown }).surfaceOp === 'append') {
      const turn = (event as { data?: { turn?: number } }).data?.turn
      if (turn !== undefined) {
        return { id: String(turn), role: 'update' as const }
      }
    }
    return null
  },
  start: (_context: unknown, match: { event: { data: { turn: number } } }): ImageDeliverablesState => {
    return {
      turn: match.event.data.turn,
      calls: new Map(),
      images: [],
    }
  },
  update: (context: { state: ImageDeliverablesState }, match: { event: Record<string, unknown> }): ImageDeliverablesState => {
    const event = match.event
    if (event.type === 'tool/call') {
      const data = event.data as { callId?: string; name?: string; arguments?: string } | undefined
      if (data?.name === 'generate_image' && data.callId) {
        let prompt: string | undefined
        try {
          const parsed = JSON.parse(data.arguments || '{}') as { prompt?: unknown }
          if (typeof parsed?.prompt === 'string') prompt = parsed.prompt
        } catch {
          // ignore malformed arguments
        }
        const calls = new Map(context.state.calls)
        calls.set(String(data.callId), { prompt })
        return { ...context.state, calls }
      }
      return context.state
    }

    if (event.type === 'tool/result') {
      const data = event.data as {
        message?: { source?: { callId?: string }; content?: Array<{ isError?: boolean; type?: string; attachment?: ImageAttachmentRef }> }
        meta?: unknown
      } | undefined
      const callId = String(data?.message?.source?.callId || '')
      const isError = data?.message?.content?.[0]?.isError === true
      if (isError) return context.state

      // 1. Try presentationMeta
      let attachment = imageAttachmentFromMeta(data?.meta)
      // 2. Fallback to message content
      if (attachment === undefined && Array.isArray(data?.message?.content)) {
        const item = data.message.content.find((c) => c.type === 'image' && c.attachment)
        if (item?.attachment) attachment = item.attachment
      }
      if (attachment === undefined) return context.state

      const meta = (typeof data?.meta === 'object' && data?.meta !== null ? data.meta : {}) as Record<string, unknown>
      const callInfo = context.state.calls.get(callId)
      const prompt = typeof meta.prompt === 'string' ? meta.prompt : (callInfo?.prompt || 'Generated Image')
      const engine = meta.engine
      const savedTo = typeof meta.savedTo === 'string' ? meta.savedTo : undefined
      const createdAt = typeof meta.createdAt === 'number' ? meta.createdAt : Date.now()

      if (context.state.images.some((img) => img.callId === callId)) {
        return context.state
      }

      const newImage: GeneratedImageDeliverable = {
        seq: typeof event.seq === 'number' ? event.seq : 0,
        callId,
        attachment,
        prompt,
        engine,
        savedTo,
        createdAt,
      }

      return {
        ...context.state,
        images: [...context.state.images, newImage],
      }
    }

    return context.state
  },
  buildLocationData: (context: { state?: ImageDeliverablesState }, scope: string, previous: unknown) => {
    if (scope !== 'turn' || context.state === void 0) return null
    const prev = previous as { kind?: string; turn?: number; key?: string; value?: { images?: unknown } } | undefined
    if (
      prev?.kind === 'turn' &&
      prev.turn === context.state.turn &&
      prev.key === IMAGE_DELIVERABLES_KIND &&
      prev.value?.images === context.state.images
    ) {
      return prev
    }
    return {
      kind: 'turn' as const,
      turn: context.state.turn,
      key: IMAGE_DELIVERABLES_KIND,
      value: { images: context.state.images },
    }
  },
}

/** Selector for conversation.chat.turnTail. */
export function selectGeneratedImages(owner: {
  turn: { data: { get: (key: string) => unknown } }
  seq: number
}): GeneratedImageDeliverable[] | null {
  const data = owner.turn.data.get(IMAGE_DELIVERABLES_KIND) as { images?: GeneratedImageDeliverable[] } | undefined
  if (!data?.images || data.images.length === 0) return null
  const valid = data.images.filter((img) => img.seq <= owner.seq)
  return valid.length === 0 ? null : valid
}

const DICT = {
  zh: {
    generatedTitle: '已生成图片',
    copyImg: '复制图片',
    download: '下载图片',
    openNewTab: '新标签页打开',
    copiedImage: '已复制图片',
    copyFailed: '复制失败',
    savedToPath: '已保存到',
    loading: '正在加载图片…',
    loadFailed: '图片读取失败 ({status})',
  },
  en: {
    generatedTitle: 'Generated image',
    copyImg: 'Copy Image',
    download: 'Download Image',
    openNewTab: 'Open in new tab',
    copiedImage: 'Image copied',
    copyFailed: 'Copy failed',
    savedToPath: 'Saved to',
    loading: 'Loading image…',
    loadFailed: 'Failed to load image ({status})',
  },
} as const

type DictKey = keyof typeof DICT.zh

export interface TurnTailCardProps {
  matched: GeneratedImageDeliverable[]
  openFile?: (path: string) => void
  locale?: LocaleService | undefined
}

export function TurnTailImagesCard({ matched, openFile, locale }: TurnTailCardProps) {
  if (!matched || matched.length === 0) return null
  return (
    <div className="dsh-ig-turntail-wrap" data-deliverables-images="true">
      {matched.map((item) => (
        <SingleGeneratedImageView
          key={item.callId || item.attachment.attachmentId}
          attachment={item.attachment}
          engine={item.engine}
          savedTo={item.savedTo}
          prompt={item.prompt}
          createdAt={item.createdAt}
          openFile={openFile}
          locale={locale}
        />
      ))}
    </div>
  )
}

export interface SingleViewProps {
  attachment: ImageAttachmentRef
  engine?: unknown
  savedTo?: string | undefined
  prompt: string
  createdAt?: number | undefined
  openFile?: ((path: string) => void) | undefined
  locale?: LocaleService | undefined
}

export function SingleGeneratedImageView({
  attachment,
  engine,
  savedTo,
  prompt,
  createdAt,
  openFile,
  locale,
}: SingleViewProps) {
  const normalizedMetadata = normalizeGalleryItem({ engine })
  const [url, setUrl] = useState<string>()
  const [blob, setBlob] = useState<Blob>()
  const [error, setError] = useState<string>()
  const [previewOpen, setPreviewOpen] = useState(false)
  const [toast, setToast] = useState<string>()
  const [lang, setLang] = useState(() => (locale?.getSnapshot?.()?.active?.startsWith('en') ? 'en' : 'zh'))

  useEffect(() => {
    return locale?.subscribe?.(() => {
      setLang(locale?.getSnapshot?.()?.active?.startsWith('en') ? 'en' : 'zh')
    })
  }, [locale])

  const t = (keyName: DictKey, params?: Record<string, string>): string => {
    const dict = lang === 'en' ? DICT.en : DICT.zh
    let text: string = dict[keyName] || DICT.zh[keyName] || keyName
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        text = text.replace(`{${k}}`, v)
      }
    }
    return text
  }

  // Auto-collect into gallery IndexedDB
  useEffect(() => {
    const item = normalizeGalleryItem({
      id: attachment.attachmentId,
      attachment,
      prompt,
      engine,
      createdAt,
    })
    void saveGalleryItem(item)
  }, [attachment.attachmentId, createdAt, prompt, engine])

  useEffect(() => {
    if (!previewOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPreviewOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [previewOpen])

  useEffect(() => {
    const controller = new AbortController()
    let objectUrl: string | undefined
    void fetch(IMAGE_ROUTE, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ attachment }),
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(t('loadFailed', { status: String(response.status) }))
        const resBlob = await response.blob()
        if (controller.signal.aborted) return
        setBlob(resBlob)
        objectUrl = URL.createObjectURL(resBlob)
        setUrl(objectUrl)
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : String(cause))
      })
    return () => {
      controller.abort()
      if (objectUrl !== undefined) URL.revokeObjectURL(objectUrl)
    }
  }, [attachment.attachmentId, lang])

  const copy = async (e: MouseEvent) => {
    e.stopPropagation()
    if (!blob) return
    const ok = await copyImageBlob(blob)
    setToast(ok ? t('copiedImage') : t('copyFailed'))
    setTimeout(() => {
      setToast(undefined)
    }, 2000)
  }

  const download = (e: MouseEvent) => {
    e.stopPropagation()
    if (!url) return
    const a = document.createElement('a')
    a.href = url
    a.download = attachment?.name || `dsh-image-${Date.now()}.png`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  const openNewTab = (e: MouseEvent) => {
    e.stopPropagation()
    if (!url) return
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const onOpenFilePath = (e: MouseEvent) => {
    e.stopPropagation()
    if (savedTo && openFile) openFile(savedTo)
  }

  return (
    <section className="dsh-ig-result" aria-label={t('generatedTitle')}>
      <div className="dsh-ig-result-title" title={normalizedMetadata.normalizationError}>
        {t('generatedTitle')} · {galleryEngineLabel(normalizedMetadata.engine)}
      </div>
      {savedTo !== undefined ? (
        <div className="dsh-ig-savedto">
          {t('savedToPath')}:{' '}
          {openFile ? (
            <button type="button" className="dsh-ig-file-btn" onClick={onOpenFilePath} title={savedTo}>
              {savedTo}
            </button>
          ) : (
            <span>{savedTo}</span>
          )}
        </div>
      ) : null}
      {error !== undefined ? <div className="dsh-ig-error">{error}</div> : null}
      {url === undefined && error === undefined ? <div className="dsh-ig-loading">{t('loading')}</div> : null}
      {url !== undefined ? (
        <div className="dsh-ig-container">
          <img
            className="dsh-ig-image"
            src={url}
            alt={attachment.name ?? 'Generated image'}
            onClick={() => {
              setPreviewOpen(true)
            }}
          />
          <div className="dsh-ig-toolbar">
            <button type="button" className="dsh-ig-tool-btn" title={t('copyImg')} onClick={(e) => { void copy(e) }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            </button>
            <button type="button" className="dsh-ig-tool-btn" title={t('download')} onClick={download}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </button>
            <button type="button" className="dsh-ig-tool-btn" title={t('openNewTab')} onClick={openNewTab}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
            </button>
            {toast ? <div className="dsh-ig-toast">{toast}</div> : null}
          </div>
        </div>
      ) : null}

      {previewOpen && url !== undefined ? (
        <div className="dsh-ig-lightbox-backdrop" onClick={() => { setPreviewOpen(false) }}>
          <div className="dsh-ig-lightbox-img-wrap" onClick={(e) => { e.stopPropagation() }}>
            <img className="dsh-ig-lightbox-img" src={url} alt={attachment.name ?? 'Generated image preview'} />
          </div>
        </div>
      ) : null}
    </section>
  )
}
