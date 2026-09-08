/**
 * Turn-tail deliverable representation for generated images.
 * Renders directly at the tail of the closing assistant message,
 * outside of the collapsed Turn Process.
 */
import { useEffect, useState, type MouseEvent } from 'react'
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import {
  IMAGE_ROUTE,
  imageAttachment,
  imageAttachmentFromMeta,
  record,
} from '../shared.js'
import { galleryEngineLabel, normalizeGalleryItem, saveGalleryItem } from './gallery-store.js'
import { copyImageBlob, type LocaleService } from './gallery-view.js'

export interface GeneratedImageDeliverable {
  seq: number
  callId: string
  attachment: ImageAttachmentRef
  prompt: string
  engine: unknown
  operation?: unknown
  model?: unknown
  output?: unknown
  aspectRatio?: unknown
  imageSize?: unknown
  saveError?: unknown
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
      if ((data?.name === 'generate_image' || data?.name === 'edit_image') && data.callId) {
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
        message?: { source?: { callId?: string }; content?: unknown; meta?: unknown }
        meta?: unknown
      } | undefined
      const rawCallId = data?.message?.source?.callId
      if (typeof rawCallId !== 'string' || rawCallId.trim() === '') return context.state
      const callId = rawCallId
      if (contentHasError(data?.message?.content)) return context.state

      // 1. Try presentationMeta. Older DSH result messages may carry the
      // metadata on the message object rather than the event envelope.
      let attachment = imageAttachmentFromMeta(data?.meta) ?? imageAttachmentFromMeta(data?.message?.meta)
      // 2. Fallback to both modern block content and nested legacy result
      // message content (`content[0].content`).
      if (attachment === undefined) attachment = attachmentFromContent(data?.message?.content)
      if (attachment === undefined) return context.state

      const meta = {
        ...(imageMetaRecord(data?.message?.meta) ?? {}),
        ...(imageMetaRecord(data?.meta) ?? {}),
      }
      const callInfo = context.state.calls.get(callId)
      const prompt = typeof meta.prompt === 'string' ? meta.prompt : (callInfo?.prompt || 'Generated Image')
      const engine = meta.engine
      const operation = meta.operation
      const model = meta.model
      const output = meta.output
      const aspectRatio = meta.aspectRatio
      const imageSize = meta.imageSize
      const saveError = meta.saveError
      const savedTo = typeof meta.savedTo === 'string' ? meta.savedTo : undefined
      const rawCreatedAt = typeof meta.createdAt === 'number' && Number.isFinite(meta.createdAt)
        ? meta.createdAt
        : typeof event.time === 'number' && Number.isFinite(event.time)
          ? event.time
          : typeof event.seq === 'number' && Number.isFinite(event.seq)
            ? event.seq
            : 0
      const createdAt = rawCreatedAt

      if (context.state.images.some((img) => img.callId === callId)) {
        return context.state
      }

      const newImage: GeneratedImageDeliverable = {
        seq: typeof event.seq === 'number' ? event.seq : 0,
        callId,
        attachment,
        prompt,
        engine,
        ...(operation === undefined ? {} : { operation }),
        ...(model === undefined ? {} : { model }),
        ...(output === undefined ? {} : { output }),
        ...(aspectRatio === undefined ? {} : { aspectRatio }),
        ...(imageSize === undefined ? {} : { imageSize }),
        ...(saveError === undefined ? {} : { saveError }),
        ...(savedTo === undefined ? {} : { savedTo }),
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
  const images = record(owner.turn.data.get(IMAGE_DELIVERABLES_KIND))?.images
  if (!Array.isArray(images)) return null
  const valid = images.flatMap((candidate: unknown) => {
    const image = record(candidate)
    const attachment = imageAttachment(image?.attachment)
    if (image === undefined || attachment === undefined || typeof image.callId !== 'string' || image.callId.trim() === '' || typeof image.seq !== 'number' || !Number.isFinite(image.seq) || image.seq > owner.seq || typeof image.prompt !== 'string') return []
    return [{ ...image, attachment } as unknown as GeneratedImageDeliverable]
  })
  return valid.length === 0 ? null : valid
}

function contentHasError(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(contentHasError)
  const entry = record(value)
  if (entry === undefined) return false
  if (entry.isError === true) return true
  return contentHasError(entry.content)
}

function attachmentFromContent(value: unknown): ImageAttachmentRef | undefined {
  if (Array.isArray(value)) {
    for (const entry of value) {
      const attachment = attachmentFromContent(entry)
      if (attachment !== undefined) return attachment
    }
    return undefined
  }
  const entry = record(value)
  if (entry === undefined) return undefined
  if (entry.type === 'image') {
    const attachment = imageAttachment(entry.attachment)
    if (attachment !== undefined) return attachment
  }
  return attachmentFromContent(entry.content)
}

const DICT = {
  zh: {
    generatedTitle: '已生成图片',
    editedTitle: '已编辑图片',
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
    editedTitle: 'Edited image',
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
  locale?: LocaleService | undefined
}

export function TurnTailImagesCard({ matched, locale }: TurnTailCardProps) {
  if (!matched || matched.length === 0) return null
  return (
    <div className="dsh-ig-turntail-wrap" data-deliverables-images="true">
      {matched.map((item) => (
        <SingleGeneratedImageView
          key={item.callId || item.attachment.attachmentId}
          attachment={item.attachment}
          engine={item.engine}
          operation={item.operation}
          model={item.model}
          output={item.output}
          aspectRatio={item.aspectRatio}
          imageSize={item.imageSize}
          saveError={item.saveError}
          savedTo={item.savedTo}
          prompt={item.prompt}
          createdAt={item.createdAt}
          locale={locale}
        />
      ))}
    </div>
  )
}

export interface SingleViewProps {
  attachment: ImageAttachmentRef
  engine?: unknown
  operation?: unknown
  model?: unknown
  output?: unknown
  aspectRatio?: unknown
  imageSize?: unknown
  saveError?: unknown
  savedTo?: string | undefined
  prompt: string
  createdAt?: number | undefined
  locale?: LocaleService | undefined
}

export function SingleGeneratedImageView({
  attachment,
  engine,
  operation,
  model,
  output,
  aspectRatio,
  imageSize,
  saveError,
  savedTo,
  prompt,
  createdAt,
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

  const attachmentKey = JSON.stringify({
    id: attachment.attachmentId,
    mediaType: attachment.mediaType,
    bytes: attachment.bytes,
    width: attachment.width,
    height: attachment.height,
    name: attachment.name,
    originalDimensions: attachment.originalDimensions,
  })

  // Auto-collect into gallery IndexedDB
  useEffect(() => {
    const item = normalizeGalleryItem({
      id: attachment.attachmentId,
      attachment,
      prompt,
      engine,
      ...(typeof model === 'string' ? { model } : {}),
      ...(typeof output === 'string' ? { output } : {}),
      ...(typeof aspectRatio === 'string' ? { aspectRatio } : {}),
      ...(typeof imageSize === 'string' ? { imageSize } : {}),
      ...(typeof saveError === 'string' ? { saveError } : {}),
      ...(savedTo === undefined ? {} : { savedTo }),
      createdAt,
    })
    void saveGalleryItem(item)
  }, [attachmentKey, createdAt, prompt, engine, model, output, aspectRatio, imageSize, saveError, savedTo])

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
    setUrl(undefined)
    setBlob(undefined)
    setError(undefined)
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
  }, [attachmentKey, lang])

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
    const extension = extensionForMediaType(attachment.mediaType)
    const safeName = typeof attachment.name === 'string' && /^[a-z0-9._-]+$/iu.test(attachment.name) ? attachment.name : `dsh-image-${Date.now()}`
    a.download = /\.(?:png|jpe?g|webp|gif)$/iu.test(safeName) ? safeName : `${safeName}.${extension}`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  const openNewTab = (e: MouseEvent) => {
    e.stopPropagation()
    if (!url) return
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  return (
    <section className="dsh-ig-result" aria-label={t(operation === 'edit' ? 'editedTitle' : 'generatedTitle')}>
      <div className="dsh-ig-result-title" title={normalizedMetadata.normalizationError}>
        {t(operation === 'edit' ? 'editedTitle' : 'generatedTitle')} · {galleryEngineLabel(normalizedMetadata.engine)}
      </div>
      {typeof saveError === 'string' ? <div className="dsh-ig-error">{saveError}</div> : null}
      {savedTo !== undefined ? (
        <div className="dsh-ig-savedto">
          {t('savedToPath')}:{' '}
          <span>{savedTo}</span>
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

function imageMetaRecord(value: unknown): Record<string, unknown> | undefined {
  const candidate = record(value)
  return candidate?.kind === 'dsh-image-gen' ? candidate : undefined
}

function extensionForMediaType(mediaType: ImageAttachmentRef['mediaType']): string {
  if (mediaType === 'image/jpeg') return 'jpg'
  if (mediaType === 'image/webp') return 'webp'
  if (mediaType === 'image/gif') return 'gif'
  return 'png'
}
