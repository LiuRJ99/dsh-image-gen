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
interface SettingsFace { scope: SettingsScope<ImageSettings>; credentials: ConnectionHandle['api']['credentials'] }
type SettingsCardProps = PropsRuntime<'settings.plugin.item'> & InjectFace<SettingsFace>
type ImageCardProps = PropsRuntime<'tool.call.toolview'>

const KEY_REF: Record<Provider, string> = { google: 'GEMINI_API_KEY', openai: 'OPENAI_API_KEY', seedream: 'ARK_API_KEY' }
const PROVIDER_LABEL: Record<Provider, string> = { google: 'Google Gemini', openai: 'OpenAI / 中转站', seedream: '字节 Seedream' }

const STYLE = `
.dsh-ig-card{list-style:none;border:1px solid var(--border-color,#e5e7eb);border-radius:14px;background:var(--surface-color,#fff);overflow:hidden}.dsh-ig-head{width:100%;padding:18px 20px;border:0;background:transparent;text-align:left;cursor:pointer;display:flex;justify-content:space-between;gap:16px;color:inherit}.dsh-ig-title{display:block;font-size:16px;font-weight:650}.dsh-ig-desc{display:block;margin-top:5px;color:#7b818b;font-size:14px}.dsh-ig-body{padding:0 20px 20px;border-top:1px solid var(--border-color,#eee)}.dsh-ig-field{display:grid;gap:7px;margin-top:18px}.dsh-ig-label{font-size:14px;font-weight:600}.dsh-ig-input{box-sizing:border-box;width:100%;padding:10px 12px;border:1px solid #d7dbe0;border-radius:9px;background:transparent;color:inherit}.dsh-ig-input-group{display:flex;gap:8px;align-items:center}.dsh-ig-btn-reset{padding:9px 14px;border:1px solid #d7dbe0;border-radius:9px;background:var(--surface-color,#f9fafb);color:inherit;font-size:13px;cursor:pointer;white-space:nowrap;transition:background .15s}.dsh-ig-btn-reset:hover{background:#edf0f3}.dsh-ig-hint,.dsh-ig-status{margin:0;color:#7b818b;font-size:12px}.dsh-ig-actions{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:16px}.dsh-ig-save{border:0;border-radius:9px;padding:9px 16px;background:#4c78ff;color:#fff;cursor:pointer}.dsh-ig-save:disabled{opacity:.55;cursor:default}.dsh-ig-result{display:grid;gap:10px;max-width:520px}.dsh-ig-result-title{font-size:14px;font-weight:600}.dsh-ig-image{display:block;max-width:100%;max-height:520px;border-radius:14px;background:#f2f3f5}.dsh-ig-error{color:#d33;font-size:13px}.dsh-ig-loading{color:#7b818b;font-size:13px}`

/** Required browser services. */
export const inject = ['slots', 'connection', 'remote', 'settingsScope']

/** Mount the settings card and generated-image card. */
export function apply(ctx: Context): void {
  const { api } = ctx.get('connection') as ConnectionHandle
  const scope = ctx.settingsScope.bind<ImageSettings>({ namespace: IMAGE_GENERATION_NAMESPACE as never })
  ctx.effect(() => {
    const style = document.createElement('style'); style.dataset.plugin = 'dsh-image-gen'; style.textContent = STYLE; document.head.appendChild(style)
    return () => { style.remove() }
  }, 'dsh-image-gen: styles')
  const register = ctx.slots.register.bind(ctx.slots) as unknown as (options: object, component: unknown) => () => void
  ctx.slots.inject('settings.plugin.item', () => register({
    name: 'settings.plugin.item',
    key: IMAGE_GENERATION_NAMESPACE,
    id: IMAGE_GENERATION_NAMESPACE,
    inject: (): SettingsFace => ({ scope, credentials: api.credentials }),
  }, ImageGenerationSettingsCard))
  ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({ name: 'tool.call.toolview', key: 'generate_image' }, GeneratedImageCard))
}

/** Edit provider settings and its write-only API credential. */
export function ImageGenerationSettingsCard(props: SettingsCardProps) {
  const [open, setOpen] = useState(false)
  const [snapshot, setSnapshot] = useState(() => props.scope.getSnapshot())
  const [provider, setProvider] = useState<Provider>('google')
  const [model, setModel] = useState('')
  const [baseURL, setBaseURL] = useState('')
  const [key, setKey] = useState('')
  const [configured, setConfigured] = useState<boolean | undefined>()
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  useEffect(() => props.scope.subscribe(() => { setSnapshot(props.scope.getSnapshot()) }), [props.scope])
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
      setMessage('已保存')
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : String(cause)) } finally { setSaving(false) }
  }
  const keyStatus = configured === undefined ? '正在检查 API Key…' : configured ? '已配置 API Key' : '尚未配置 API Key'
  return <li className="dsh-ig-card"><button type="button" className="dsh-ig-head" aria-expanded={open} onClick={() => { setOpen(value => !value) }}><span><span className="dsh-ig-title">图像生成</span><span className="dsh-ig-desc">选择厂商并配置生图模型。</span></span><span aria-hidden="true">{open ? '⌃' : '⌄'}</span></button>{open ? <form className="dsh-ig-body" onSubmit={(event) => { void save(event) }}>
    <label className="dsh-ig-field"><span className="dsh-ig-label">Provider</span><select className="dsh-ig-input" value={provider} onChange={event => { const next = event.target.value as Provider; setProvider(next); setModel(modelOf(next, snapshot.value)); setBaseURL(baseURLOf(next, snapshot.value)); setKey('') }}><option value="google">Google Gemini</option><option value="openai">OpenAI / 中转站</option><option value="seedream">字节 Seedream</option></select><span className="dsh-ig-hint">{PROVIDER_LABEL[provider]}</span></label>
    <label className="dsh-ig-field"><span className="dsh-ig-label">{PROVIDER_LABEL[provider]} API Key</span><input className="dsh-ig-input" type="password" autoComplete="off" value={key} onChange={event => { setKey(event.target.value) }} placeholder={configured ? '留空即可保留已配置的 Key' : ''} /><span className="dsh-ig-hint">安全保存为 {KEY_REF[provider]}；页面不会读回明文。</span></label>
    <label className="dsh-ig-field"><span className="dsh-ig-label">接口地址</span><div className="dsh-ig-input-group"><input className="dsh-ig-input" type="url" value={baseURL} onChange={event => { setBaseURL(event.target.value) }} required /><button type="button" className="dsh-ig-btn-reset" title="重置为默认官方地址" onClick={() => { setBaseURL(DEFAULT_BASE_URLS[provider]) }}>重置</button></div><span className="dsh-ig-hint">{provider === 'google' ? 'Google 官方地址或反代端点（全路径）。' : provider === 'openai' ? '中转站请填其 OpenAI 兼容的 /v1 地址。' : '火山方舟兼容的 /api/v3 地址。'}</span></label>
    <label className="dsh-ig-field"><span className="dsh-ig-label">模型</span><input className="dsh-ig-input" value={model} onChange={event => { setModel(event.target.value) }} required /></label>
    <div className="dsh-ig-actions"><p className="dsh-ig-status" role="status">{message || keyStatus}</p><button className="dsh-ig-save" type="submit" disabled={saving || !snapshot.writable}>{saving ? '保存中…' : '保存'}</button></div>
  </form> : null}</li>
}

/** Render the durable attachment referenced by a completed image tool call. */
export function GeneratedImageCard(props: ImageCardProps) {
  const attachment = imageRef(props.block); const [url, setUrl] = useState<string>(); const [error, setError] = useState<string>()
  useEffect(() => { if (attachment === undefined) return; const controller = new AbortController(); let objectUrl: string | undefined
    void fetch(IMAGE_ROUTE, { method: 'POST', signal: controller.signal, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ attachment }) }).then(async response => { if (!response.ok) throw new Error(`图片读取失败 (${String(response.status)})`); const blob = await response.blob(); if (controller.signal.aborted) return; objectUrl = URL.createObjectURL(blob); setUrl(objectUrl) }).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : String(cause)) })
    return () => { controller.abort(); if (objectUrl !== undefined) URL.revokeObjectURL(objectUrl) }
  }, [attachment?.attachmentId])
  if (attachment === undefined) return <div className="dsh-ig-loading">正在生成图片…</div>
  return <section className="dsh-ig-result" aria-label="Generated image"><div className="dsh-ig-result-title">Generated image</div>{error !== undefined ? <div className="dsh-ig-error">{error}</div> : null}{url === undefined && error === undefined ? <div className="dsh-ig-loading">正在加载图片…</div> : null}{url !== undefined ? <img className="dsh-ig-image" src={url} alt={attachment.name ?? 'Generated image'} /> : null}</section>
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
