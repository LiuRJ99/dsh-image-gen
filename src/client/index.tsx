/** Web settings and generated-image cards contributed by the Bundle. */
import { useEffect, useState, type FormEvent } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type { SettingsScope, ToolCallBlock } from '@deepseek-ai/dsh-client-runtime/client'
import type { InjectFace, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'
import type {} from '@deepseek-ai/dsh-client-ui-tool/client'
import {
  DEFAULT_BASE_URLS,
  DEFAULT_MODELS,
  IMAGE_GENERATION_NAMESPACE,
  IMAGE_ROUTE,
  type ImageProvider,
} from '../shared.js'

type Provider = ImageProvider
interface ImageSettings { provider?: Provider; googleModel?: string; googleEndpoint?: string; openaiBaseURL?: string; openaiModel?: string; seedreamBaseURL?: string; seedreamModel?: string }
interface LocaleService { getSnapshot(): { active: string }; subscribe(fn: () => void): () => void }
interface SettingsFace { scope: SettingsScope<ImageSettings>; credentials: ConnectionHandle['api']['credentials']; locale?: LocaleService | undefined }
type SettingsCardProps = PropsRuntime<'settings.plugin.item'> & InjectFace<SettingsFace>
type ImageCardProps = PropsRuntime<'tool.call.toolview'>

const KEY_REF: Record<Provider, string> = { google: 'GEMINI_API_KEY', openai: 'OPENAI_API_KEY', seedream: 'ARK_API_KEY' }

const DICT = {
  zh: {
    title: '图像生成',
    description: '选择厂商并配置生图模型。',
    provider: 'Provider',
    providerGoogle: 'Google Gemini',
    providerOpenAI: 'OpenAI / 中转站',
    providerSeedream: '字节 Seedream',
    apiKeyLabel: '{provider} API Key',
    apiKeyPlaceholder: '留空即可保留已配置的 Key',
    apiKeyHint: '安全保存为 {key}；页面不会读回明文。',
    endpoint: '接口地址',
    reset: '重置',
    resetTitle: '重置为默认官方地址',
    endpointHintGoogle: 'Google 官方地址或反代端点（全路径）。',
    endpointHintOpenAI: '中转站请填其 OpenAI 兼容的 /v1 地址。',
    endpointHintSeedream: '火山方舟兼容的 /api/v3 地址。',
    model: '模型',
    saving: '保存中…',
    save: '保存',
    saved: '已保存',
    checkingKey: '正在检查 API Key…',
    keyConfigured: '已配置 API Key',
    keyNotConfigured: '尚未配置 API Key',
    generating: '正在生成图片…',
    loading: '正在加载图片…',
    loadFailed: '图片读取失败 ({status})',
    generatedTitle: 'Generated image',
  },
  en: {
    title: 'Image Generation',
    description: 'Select provider and configure image generation models.',
    provider: 'Provider',
    providerGoogle: 'Google Gemini',
    providerOpenAI: 'OpenAI / Relay',
    providerSeedream: 'ByteDance Seedream',
    apiKeyLabel: '{provider} API Key',
    apiKeyPlaceholder: 'Leave empty to keep configured key',
    apiKeyHint: 'Securely saved as {key}; never read back in plaintext.',
    endpoint: 'Endpoint / Base URL',
    reset: 'Reset',
    resetTitle: 'Reset to official default URL',
    endpointHintGoogle: 'Official Google endpoint or reverse proxy (full path).',
    endpointHintOpenAI: 'OpenAI-compatible /v1 base URL for relays.',
    endpointHintSeedream: 'Volcengine Ark compatible /api/v3 base URL.',
    model: 'Model',
    saving: 'Saving…',
    save: 'Save',
    saved: 'Saved',
    checkingKey: 'Checking API Key…',
    keyConfigured: 'API Key configured',
    keyNotConfigured: 'API Key not configured',
    generating: 'Generating image…',
    loading: 'Loading image…',
    loadFailed: 'Failed to load image ({status})',
    generatedTitle: 'Generated image',
  },
} as const

type DictKey = keyof typeof DICT.zh

const STYLE = `
.dsh-ig-card{list-style:none;border:1px solid var(--dsw-alias-border-l2,#e5e7eb);border-radius:12px;background:var(--dsw-alias-bg-layer-3,#fff);transition:border-color .16s,background .16s;overflow:hidden}
.dsh-ig-card:hover{border-color:var(--dsw-alias-label-dimmed,#9ca3af)}
.dsh-ig-card-open{background:var(--dsw-alias-bg-layer-2,#fff);border-color:var(--dsw-alias-label-dimmed,#9ca3af)}
.dsh-ig-head{width:100%;appearance:none;border:0;background:none;font:inherit;color:inherit;text-align:left;cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px;border-radius:12px}
.dsh-ig-head:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#4c78ff);outline-offset:-2px}
.dsh-ig-head-text{flex:1;min-width:0;display:flex;flex-direction:column;gap:4px}
.dsh-ig-title{display:block;font-size:15px;font-weight:600;line-height:1.4;color:var(--dsw-alias-label-primary,inherit)}
.dsh-ig-desc{display:block;font-size:13px;line-height:1.5;color:var(--dsw-alias-label-tertiary,#7b818b)}
.dsh-ig-chevron{flex:none;color:var(--dsw-alias-label-tertiary,#7b818b);transition:transform .16s;display:inline-flex;align-items:center}
.dsh-ig-chevron-open{transform:rotate(180deg)}
.dsh-ig-body{border-top:1px solid var(--dsw-alias-border-l2,#eee);padding:0 16px 16px}
.dsh-ig-field{display:grid;gap:6px;margin-top:14px}
.dsh-ig-label{font-size:13px;font-weight:500;color:var(--dsw-alias-label-primary,inherit)}
.dsh-ig-input{box-sizing:border-box;width:100%;padding:8px 12px;font-size:13px;border:1px solid var(--dsw-alias-border-l2,#d7dbe0);border-radius:8px;background:var(--dsw-alias-bg-layer-3,transparent);color:inherit;outline:none;transition:border-color .15s}
.dsh-ig-input:focus{border-color:var(--dsw-alias-brand-primary,#4c78ff)}
.dsh-ig-input-group{display:flex;gap:8px;align-items:center}
.dsh-ig-btn-reset{appearance:none;border:1px solid var(--dsw-alias-border-l2,#d7dbe0);border-radius:8px;padding:7px 12px;background:var(--dsw-alias-bg-layer-3,#f9fafb);color:var(--dsw-alias-label-secondary,inherit);font:inherit;font-size:13px;cursor:pointer;white-space:nowrap;transition:background .15s,border-color .15s}
.dsh-ig-btn-reset:hover{background:var(--dsw-alias-bg-layer-2,#edf0f3);border-color:var(--dsw-alias-label-dimmed,#9ca3af)}
.dsh-ig-hint,.dsh-ig-status{margin:0;color:var(--dsw-alias-label-tertiary,#7b818b);font-size:12px;line-height:1.4}
.dsh-ig-actions{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:16px;padding-top:12px;border-top:1px solid var(--dsw-alias-border-l2,#eee)}
.dsh-ig-save{appearance:none;border:0;border-radius:8px;padding:6px 16px;background:var(--dsw-alias-label-primary,#111827);color:var(--dsw-alias-bg-layer-3,#fff);font:inherit;font-size:13px;font-weight:500;cursor:pointer;transition:opacity .15s}
.dsh-ig-save:disabled{opacity:.4;cursor:default}
.dsh-ig-result{display:grid;gap:10px;max-width:520px}
.dsh-ig-result-title{font-size:14px;font-weight:600}
.dsh-ig-container{position:relative;display:inline-block;width:fit-content;max-width:100%;justify-self:start;border-radius:12px;overflow:hidden;line-height:0}
.dsh-ig-container:hover .dsh-ig-toolbar{opacity:1;pointer-events:auto}
.dsh-ig-toolbar{position:absolute;top:8px;left:8px;display:flex;align-items:center;gap:5px;padding:3px 5px;border-radius:8px;background:rgba(0,0,0,0.65);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);opacity:0;pointer-events:none;transition:opacity .18s ease;z-index:10;line-height:1}
.dsh-ig-tool-btn{appearance:none;border:0;background:transparent;color:#fff;padding:5px;border-radius:6px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;transition:background .15s}
.dsh-ig-tool-btn:hover{background:rgba(255,255,255,0.25)}
.dsh-ig-toast{position:absolute;top:100%;left:0;margin-top:5px;padding:3px 8px;border-radius:6px;background:rgba(0,0,0,0.85);color:#fff;font-size:11px;white-space:nowrap;pointer-events:none;z-index:20}
.dsh-ig-image{display:block;max-width:100%;max-height:520px;border-radius:12px;background:#f2f3f5;cursor:pointer}
.dsh-ig-modal{position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.88);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:20px;box-sizing:border-box;cursor:zoom-out;animation:dsh-ig-fade .15s ease-out}
@keyframes dsh-ig-fade{from{opacity:0}to{opacity:1}}
.dsh-ig-modal-img{max-width:92vw;max-height:92vh;object-fit:contain;border-radius:8px;box-shadow:0 24px 60px rgba(0,0,0,0.6);user-select:none;cursor:default}
.dsh-ig-error{color:var(--dsw-alias-label-error,#d33);font-size:13px}
.dsh-ig-loading{color:var(--dsw-alias-label-tertiary,#7b818b);font-size:13px}`

/** Required browser services. */
export const inject = ['slots', 'connection', 'remote', 'settingsScope', 'locale']

/** Mount the settings card and generated-image card. */
export function apply(ctx: Context): void {
  const { api } = ctx.get('connection') as ConnectionHandle
  const scope = ctx.settingsScope.bind<ImageSettings>({ namespace: IMAGE_GENERATION_NAMESPACE as never })
  const locale = ctx.get('locale') as LocaleService | undefined
  ctx.effect(() => {
    const style = document.createElement('style'); style.dataset.plugin = 'dsh-image-gen'; style.textContent = STYLE; document.head.appendChild(style)
    return () => { style.remove() }
  }, 'dsh-image-gen: styles')
  const register = ctx.slots.register.bind(ctx.slots) as unknown as (options: object, component: unknown) => () => void
  ctx.slots.inject('settings.plugin.item', () => register({
    name: 'settings.plugin.item',
    key: IMAGE_GENERATION_NAMESPACE,
    id: IMAGE_GENERATION_NAMESPACE,
    order: 100,
    inject: (): SettingsFace => ({ scope, credentials: api.credentials, locale }),
  }, ImageGenerationSettingsCard))
  ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({ name: 'tool.call.toolview', key: 'generate_image' }, GeneratedImageCard))
}

/** Edit provider settings and its write-only API credential. */
export function ImageGenerationSettingsCard(props: SettingsCardProps) {
  const [open, setOpen] = useState(false)
  const [snapshot, setSnapshot] = useState(() => props.scope.getSnapshot())
  const [lang, setLang] = useState(() => props.locale?.getSnapshot?.()?.active ?? 'zh')
  const [provider, setProvider] = useState<Provider>('google')
  const [model, setModel] = useState('')
  const [baseURL, setBaseURL] = useState('')
  const [key, setKey] = useState('')
  const [configured, setConfigured] = useState<boolean | undefined>()
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => props.scope.subscribe(() => { setSnapshot(props.scope.getSnapshot()) }), [props.scope])
  useEffect(() => {
    return props.locale?.subscribe?.(() => {
      setLang(props.locale?.getSnapshot?.()?.active ?? 'zh')
    })
  }, [props.locale])

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

  const providerLabels: Record<Provider, string> = {
    google: t('providerGoogle'),
    openai: t('providerOpenAI'),
    seedream: t('providerSeedream'),
  }

  useEffect(() => {
    const value = snapshot.value
    const next = value?.provider ?? 'google'
    setProvider(next); setModel(modelOf(next, value)); setBaseURL(baseURLOf(next, value))
  }, [snapshot])

  useEffect(() => {
    let active = true
    void props.credentials.describe({ refs: [KEY_REF[provider]] }).then(response => {
      if (active) setConfigured(response.result.ok ? response.result.value.credentials[KEY_REF[provider]]?.configured ?? false : undefined)
    }).catch(() => { if (active) setConfigured(undefined) })
    return () => { active = false }
  }, [props.credentials, provider])

  const save = async (event: FormEvent): Promise<void> => {
    event.preventDefault(); setSaving(true); setMessage('')
    try {
      await props.scope.set('provider', provider)
      await props.scope.set(provider === 'google' ? 'googleModel' : provider === 'openai' ? 'openaiModel' : 'seedreamModel', model)
      await props.scope.set(provider === 'google' ? 'googleEndpoint' : provider === 'openai' ? 'openaiBaseURL' : 'seedreamBaseURL', baseURL)
      if (key.trim().length > 0) {
        const response = await props.credentials.set({ ref: KEY_REF[provider], value: key.trim() })
        if (!response.result.ok) throw new Error(response.result.error.message)
        setKey(''); setConfigured(true)
      }
      setMessage(t('saved'))
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : String(cause)) } finally { setSaving(false) }
  }

  const keyStatus = configured === undefined ? t('checkingKey') : configured ? t('keyConfigured') : t('keyNotConfigured')

  return <li className={`dsh-ig-card ${open ? 'dsh-ig-card-open' : ''}`}><button type="button" className="dsh-ig-head" aria-expanded={open} onClick={() => { setOpen(value => !value) }}><span className="dsh-ig-head-text"><span className="dsh-ig-title">{t('title')}</span><span className="dsh-ig-desc">{t('description')}</span></span><span className={`dsh-ig-chevron ${open ? 'dsh-ig-chevron-open' : ''}`} aria-hidden="true"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6l4 4 4-4"/></svg></span></button>{open ? <form className="dsh-ig-body" onSubmit={(event) => { void save(event) }}>
    <label className="dsh-ig-field"><span className="dsh-ig-label">{t('provider')}</span><select className="dsh-ig-input" value={provider} onChange={event => { const next = event.target.value as Provider; setProvider(next); setModel(modelOf(next, snapshot.value)); setBaseURL(baseURLOf(next, snapshot.value)); setKey('') }}><option value="google">{t('providerGoogle')}</option><option value="openai">{t('providerOpenAI')}</option><option value="seedream">{t('providerSeedream')}</option></select><span className="dsh-ig-hint">{providerLabels[provider]}</span></label>
    <label className="dsh-ig-field"><span className="dsh-ig-label">{t('apiKeyLabel', { provider: providerLabels[provider] })}</span><input className="dsh-ig-input" type="password" autoComplete="off" value={key} onChange={event => { setKey(event.target.value) }} placeholder={configured ? t('apiKeyPlaceholder') : ''} /><span className="dsh-ig-hint">{t('apiKeyHint', { key: KEY_REF[provider] })}</span></label>
    <label className="dsh-ig-field"><span className="dsh-ig-label">{t('endpoint')}</span><div className="dsh-ig-input-group"><input className="dsh-ig-input" type="url" value={baseURL} onChange={event => { setBaseURL(event.target.value) }} required /><button type="button" className="dsh-ig-btn-reset" title={t('resetTitle')} onClick={() => { setBaseURL(DEFAULT_BASE_URLS[provider]) }}>{t('reset')}</button></div><span className="dsh-ig-hint">{provider === 'google' ? t('endpointHintGoogle') : provider === 'openai' ? t('endpointHintOpenAI') : t('endpointHintSeedream')}</span></label>
    <label className="dsh-ig-field"><span className="dsh-ig-label">{t('model')}</span><input className="dsh-ig-input" value={model} onChange={event => { setModel(event.target.value) }} required /></label>
    <div className="dsh-ig-actions"><p className="dsh-ig-status" role="status">{message || keyStatus}</p><button className="dsh-ig-save" type="submit" disabled={saving || !snapshot.writable}>{saving ? t('saving') : t('save')}</button></div>
  </form> : null}</li>
}

/** Render the durable attachment referenced by a completed image tool call. */
export function GeneratedImageCard(props: ImageCardProps) {
  const attachment = imageRef(props.block)
  const [url, setUrl] = useState<string>()
  const [blob, setBlob] = useState<Blob>()
  const [error, setError] = useState<string>()
  const [previewOpen, setPreviewOpen] = useState(false)
  const [toast, setToast] = useState<string>()

  useEffect(() => {
    if (!previewOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPreviewOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => { window.removeEventListener('keydown', onKeyDown) }
  }, [previewOpen])

  useEffect(() => {
    if (attachment === undefined) return
    const controller = new AbortController()
    let objectUrl: string | undefined
    void fetch(IMAGE_ROUTE, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ attachment }),
    }).then(async response => {
      if (!response.ok) throw new Error(`图片读取失败 (${String(response.status)})`)
      const resBlob = await response.blob()
      if (controller.signal.aborted) return
      setBlob(resBlob)
      objectUrl = URL.createObjectURL(resBlob)
      setUrl(objectUrl)
    }).catch(cause => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : String(cause))
    })
    return () => {
      controller.abort()
      if (objectUrl !== undefined) URL.revokeObjectURL(objectUrl)
    }
  }, [attachment?.attachmentId])

  const copy = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!blob) return
    const ok = await copyImageBlob(blob)
    setToast(ok ? '已复制图片' : '复制失败')
    setTimeout(() => { setToast(undefined) }, 2000)
  }

  const download = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!url) return
    const a = document.createElement('a')
    a.href = url
    a.download = attachment?.name || `dsh-image-${Date.now()}.png`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  const openNewTab = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!url) return
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  if (attachment === undefined) return <div className="dsh-ig-loading">正在生成图片…</div>
  return <section className="dsh-ig-result" aria-label="Generated image">
    <div className="dsh-ig-result-title">Generated image</div>
    {error !== undefined ? <div className="dsh-ig-error">{error}</div> : null}
    {url === undefined && error === undefined ? <div className="dsh-ig-loading">正在加载图片…</div> : null}
    {url !== undefined ? <div className="dsh-ig-container">
      <img
        className="dsh-ig-image"
        src={url}
        alt={attachment.name ?? 'Generated image'}
        onClick={() => { setPreviewOpen(true) }}
      />
      <div className="dsh-ig-toolbar">
        <button type="button" className="dsh-ig-tool-btn" title="复制图片" onClick={(e) => { void copy(e) }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        </button>
        <button type="button" className="dsh-ig-tool-btn" title="下载图片" onClick={download}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        </button>
        <button type="button" className="dsh-ig-tool-btn" title="新标签页打开" onClick={openNewTab}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
        </button>
        {toast ? <div className="dsh-ig-toast">{toast}</div> : null}
      </div>
    </div> : null}

    {previewOpen && url !== undefined ? <div className="dsh-ig-modal" onClick={() => { setPreviewOpen(false) }}>
      <img
        className="dsh-ig-modal-img"
        src={url}
        alt={attachment.name ?? 'Generated image preview'}
        onClick={(e) => { e.stopPropagation() }}
      />
    </div> : null}
  </section>
}

async function copyImageBlob(blob: Blob): Promise<boolean> {
  try {
    if (blob.type === 'image/png') {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      return true
    }
    const img = new Image()
    const url = URL.createObjectURL(blob)
    await new Promise((resolve, reject) => {
      img.onload = resolve
      img.onerror = reject
      img.src = url
    })
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas unavailable')
    ctx.drawImage(img, 0, 0)
    URL.revokeObjectURL(url)
    const pngBlob = await new Promise<Blob | null>(res => { canvas.toBlob(res, 'image/png') })
    if (!pngBlob) throw new Error('Blob conversion failed')
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })])
    return true
  } catch (_err) {
    return false
  }
}

function modelOf(provider: Provider, value: ImageSettings | undefined): string {
  const stored = provider === 'google' ? value?.googleModel : provider === 'openai' ? value?.openaiModel : value?.seedreamModel
  return typeof stored === 'string' && stored.length > 0 ? stored : DEFAULT_MODELS[provider]
}

function baseURLOf(provider: Provider, value: ImageSettings | undefined): string {
  const stored = provider === 'google' ? value?.googleEndpoint : provider === 'openai' ? value?.openaiBaseURL : value?.seedreamBaseURL
  return typeof stored === 'string' && stored.length > 0 ? stored : DEFAULT_BASE_URLS[provider]
}

function imageRef(block: ToolCallBlock): ImageAttachmentRef | undefined { if (!('kind' in block) || block.resultView?.card !== 'generic') return undefined; const image = block.resultView.content?.find(item => item.type === 'image'); return image?.type === 'image' ? image.attachment : undefined }
