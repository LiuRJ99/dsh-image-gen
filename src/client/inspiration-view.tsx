/** Provider-neutral Inspiration Library for the Better Sidebar Gallery. */
import { useEffect, useMemo, useRef, useState, type FC } from 'react'
import { INSPIRATION_ROUTE, type ImageEngine } from '../shared.js'
import type { InspirationCase, InspirationCatalog } from '../inspiration.js'
import { getCachedInspirationCatalog, cacheInspirationCatalog, clearInspirationCatalogCache, readBoundedCatalogBytes } from './inspiration-catalog-cache.js'
import { getInspirationImageCache, clearInspirationImageCache, MAX_INSPIRATION_IMAGE_CACHE_BYTES, readBoundedImageBlob } from './inspiration-image-cache.js'
import type { LocaleService } from './gallery-view.js'

const FAVORITES_KEY = 'dsh-image-gen:inspiration-favorites'

type Language = 'zh' | 'en'

const COPY = {
  zh: {
    title: '灵感素材', subtitle: '浏览公开案例，复制 Prompt，或直接用 CPA 引擎生成。', search: '搜索案例、Prompt、风格…', all: '全部', category: '分类', style: '风格', scene: '场景', favorites: '仅收藏', refresh: '刷新素材', refreshing: '刷新中…', clearCache: '清理缓存', loading: '正在加载灵感素材…', failed: '灵感素材加载失败', retry: '重试', noResults: '没有匹配的素材。', copy: '复制 Prompt', copied: '已复制', useGpt: '用 GPT 生成', useGemini: '用 Gemini 生成', featured: '精选', prompt: '完整 Prompt', close: '关闭', generated: '已提交 CPA 生成', cacheCleared: '缓存已清理', clearFailed: '清理缓存失败', source: '来源',
  },
  en: {
    title: 'Inspiration', subtitle: 'Explore public examples, copy a prompt, or generate it directly with a CPA engine.', search: 'Search examples, prompts, styles…', all: 'All', category: 'Category', style: 'Style', scene: 'Scene', favorites: 'Favorites only', refresh: 'Refresh library', refreshing: 'Refreshing…', clearCache: 'Clear cache', loading: 'Loading inspiration…', failed: 'Could not load inspiration', retry: 'Retry', noResults: 'No matching examples.', copy: 'Copy prompt', copied: 'Copied', useGpt: 'Generate with GPT', useGemini: 'Generate with Gemini', featured: 'Featured', prompt: 'Full prompt', close: 'Close', generated: 'CPA generation submitted', cacheCleared: 'Cache cleared', clearFailed: 'Could not clear cache', source: 'Source',
  },
} as const

type CopyKey = keyof typeof COPY.zh

export interface InspirationViewProps {
  locale?: LocaleService | undefined
  defaultEngine?: ImageEngine | undefined
  busy?: boolean
  onUsePrompt(prompt: string, engine: ImageEngine): void | Promise<void>
}

export const InspirationView: FC<InspirationViewProps> = ({ locale, defaultEngine = 'gpt', busy = false, onUsePrompt }) => {
  const [lang, setLang] = useState<Language>(() => locale?.getSnapshot?.()?.active?.startsWith('en') ? 'en' : 'zh')
  const [catalog, setCatalog] = useState<InspirationCatalog | null>(null)
  const [error, setError] = useState(false)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  const [style, setStyle] = useState('')
  const [scene, setScene] = useState('')
  const [onlyFavorites, setOnlyFavorites] = useState(false)
  const [selected, setSelected] = useState<InspirationCase | null>(null)
  const [favorites, setFavorites] = useState<Set<string>>(() => readFavorites())
  const [refreshing, setRefreshing] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const hasCatalogRef = useRef(false)
  const catalogRequestRef = useRef(0)

  useEffect(() => {
    if (!locale?.subscribe) return
    return locale.subscribe(() => setLang(locale.getSnapshot?.()?.active?.startsWith('en') ? 'en' : 'zh'))
  }, [locale])

  useEffect(() => {
    const styleNode = document.createElement('style')
    styleNode.dataset.plugin = 'dsh-image-gen-inspiration'
    styleNode.textContent = INSPIRATION_STYLE
    document.head.appendChild(styleNode)
    return () => styleNode.remove()
  }, [])

  const t = (key: CopyKey): string => COPY[lang][key] ?? COPY.zh[key]

  const loadCatalog = async (refresh = false): Promise<void> => {
    const requestId = catalogRequestRef.current + 1
    catalogRequestRef.current = requestId
    setError(false)
    try {
      const cached = refresh ? undefined : await getCachedInspirationCatalog()
      if (requestId !== catalogRequestRef.current) return
      if (cached) {
        hasCatalogRef.current = true
        setCatalog(cached)
        setSelected((old) => old ?? cached.cases[0] ?? null)
      }
      const response = await fetch(`${INSPIRATION_ROUTE}/${refresh ? 'refresh' : 'catalog'}`, {
        method: refresh ? 'POST' : 'GET',
        credentials: 'same-origin',
      })
      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined)
        throw new Error('invalid-catalog')
      }
      const bytes = await readBoundedCatalogBytes(response)
      const value = JSON.parse(new TextDecoder().decode(bytes)) as InspirationCatalog
      if (value.version !== 1 || !Array.isArray(value.cases)) throw new Error('invalid-catalog')
      if (requestId !== catalogRequestRef.current) return
      hasCatalogRef.current = true
      setCatalog(value)
      setSelected((old) => old && value.cases.some((item) => item.id === old.id) ? old : value.cases[0] ?? null)
      void cacheInspirationCatalog(value)
    } catch {
      if (requestId === catalogRequestRef.current && !hasCatalogRef.current) setError(true)
    }
  }

  useEffect(() => {
    void loadCatalog()
    // Catalog loading is intentionally mounted once; filter state is local.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const matching = useMemo(() => {
    const source = catalog?.cases ?? []
    const needle = query.trim().toLowerCase()
    return source.filter((item) => {
      if (onlyFavorites && !favorites.has(item.id)) return false
      if (category && item.category !== category) return false
      if (style && item.style !== style) return false
      if (scene && item.scene !== scene) return false
      if (!needle) return true
      return [item.title, item.description, item.prompt, item.category, item.style, item.scene].some((value) => value.toLowerCase().includes(needle))
    })
  }, [catalog, query, category, style, scene, onlyFavorites, favorites])

  useEffect(() => {
    setSelected((current) => current && matching.some((item) => item.id === current.id) ? current : matching[0] ?? null)
  }, [matching])

  const toggleFavorite = (id: string) => {
    setFavorites((old) => {
      const next = new Set(old)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      writeFavorites(next)
      return next
    })
  }

  const copyPrompt = async (item: InspirationCase | null) => {
    if (!item) return
    try {
      await copyText(item.prompt)
      setToast(t('copied'))
    } catch {
      setToast(t('failed'))
    }
  }

  const generate = async (engine: ImageEngine) => {
    if (busy || !selected) return
    try {
      await onUsePrompt(selected.prompt, engine)
      setToast(t('generated'))
    } catch (cause) {
      setToast(cause instanceof Error ? cause.message : String(cause))
    }
  }

  const refresh = async () => {
    if (refreshing) return
    setRefreshing(true)
    try {
      await loadCatalog(true)
    } finally {
      setRefreshing(false)
    }
  }

  const clearCache = async () => {
    try {
      await Promise.all([clearInspirationCatalogCache(), clearInspirationImageCache()])
      const response = await fetch(`${INSPIRATION_ROUTE}/cache-clear`, { method: 'POST', credentials: 'same-origin' })
      if (!response.ok) throw new Error('cache-clear')
      setToast(t('cacheCleared'))
    } catch {
      setToast(t('clearFailed'))
    }
  }

  return (
    <section className="dsh-ig-inspiration-page" aria-label={t('title')}>
      <header className="dsh-ig-inspiration-header">
        <div>
          <h2>{t('title')}</h2>
          <p>{t('subtitle')}</p>
        </div>
        <div className="dsh-ig-inspiration-header-actions">
          <button type="button" onClick={() => void clearCache()}>{t('clearCache')}</button>
          <button type="button" onClick={() => void refresh()} disabled={refreshing}>{refreshing ? t('refreshing') : t('refresh')}</button>
        </div>
      </header>
      <div className="dsh-ig-inspiration-toolbar">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('search')} aria-label={t('search')} />
        <label><span>{t('category')}</span><select value={category} onChange={(event) => setCategory(event.target.value)}><option value="">{t('all')}</option>{catalog?.categories.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        <label><span>{t('style')}</span><select value={style} onChange={(event) => setStyle(event.target.value)}><option value="">{t('all')}</option>{catalog?.styles.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        <label><span>{t('scene')}</span><select value={scene} onChange={(event) => setScene(event.target.value)}><option value="">{t('all')}</option>{catalog?.scenes.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        <button type="button" className={onlyFavorites ? 'is-active' : ''} onClick={() => setOnlyFavorites((value) => !value)}>★ {t('favorites')} {favorites.size > 0 ? `(${favorites.size})` : ''}</button>
      </div>
      {error ? <div className="dsh-ig-inspiration-empty"><p>{t('failed')}</p><button type="button" onClick={() => void loadCatalog()}>{t('retry')}</button></div> : catalog === null ? <div className="dsh-ig-inspiration-empty">{t('loading')}</div> : matching.length === 0 ? <div className="dsh-ig-inspiration-empty">{t('noResults')}</div> : (
        <div className="dsh-ig-inspiration-body">
          <div className="dsh-ig-inspiration-grid">
            {matching.map((item) => <InspirationCard key={item.id} item={item} selected={selected?.id === item.id} favorite={favorites.has(item.id)} featured={t('featured')} onSelect={() => setSelected(item)} onFavorite={() => toggleFavorite(item.id)} />)}
          </div>
          <aside className="dsh-ig-inspiration-inspector">
            {selected ? <>
              <InspirationImage id={selected.id} alt={selected.title} />
              <div className="dsh-ig-inspiration-inspector-copy">
                <div className="dsh-ig-inspiration-inspector-title"><h3>{selected.title}</h3><button type="button" onClick={() => toggleFavorite(selected.id)} aria-label={t('favorites')}>{favorites.has(selected.id) ? '★' : '☆'}</button></div>
                <p>{selected.description}</p>
                <div className="dsh-ig-inspiration-tags"><span>{selected.category}</span><span>{selected.style}</span><span>{selected.scene}</span></div>
                <label className="dsh-ig-inspiration-prompt-label">{t('prompt')}<textarea readOnly value={selected.prompt} /></label>
                <div className="dsh-ig-inspiration-actions"><button type="button" onClick={() => void copyPrompt(selected)}>{t('copy')}</button><button type="button" disabled={busy} onClick={() => void generate(defaultEngine)}>{defaultEngine === 'gemini' ? t('useGemini') : t('useGpt')}</button><button type="button" disabled={busy} onClick={() => void generate(defaultEngine === 'gemini' ? 'gpt' : 'gemini')}>{defaultEngine === 'gemini' ? t('useGpt') : t('useGemini')}</button></div>
              </div>
            </> : null}
          </aside>
        </div>
      )}
      {toast ? <div className="dsh-ig-inspiration-toast" role="status">{toast}</div> : null}
    </section>
  )
}

const InspirationCard: FC<{ item: InspirationCase; selected: boolean; favorite: boolean; featured: string; onSelect(): void; onFavorite(): void }> = ({ item, selected, favorite, featured, onSelect, onFavorite }) => (
  <button type="button" className={`dsh-ig-inspiration-card ${selected ? 'is-selected' : ''}`} onClick={onSelect}>
    <div className="dsh-ig-inspiration-card-media"><InspirationImage id={item.id} alt={item.title} /><span className="dsh-ig-inspiration-card-favorite" role="button" onClick={(event) => { event.stopPropagation(); onFavorite() }}>{favorite ? '★' : '☆'}</span>{item.id === 'golden-hour-portrait' ? <span className="dsh-ig-inspiration-featured">✦ {featured}</span> : null}</div>
    <strong>{item.title}</strong><small>{item.category} · {item.style}</small>
  </button>
)

const InspirationImage: FC<{ id: string; alt: string }> = ({ id, alt }) => {
  const [url, setUrl] = useState<string | undefined>()
  const [failed, setFailed] = useState(false)
  const urlRef = useRef<string | undefined>()
  useEffect(() => {
    let active = true
    const controller = new AbortController()
    setFailed(false)
    setUrl(undefined)
    if (urlRef.current !== undefined) {
      URL.revokeObjectURL(urlRef.current)
      urlRef.current = undefined
    }
    const cache = getInspirationImageCache()
    void cache.get(id).then(async (cached) => {
      if (cached) return cached
      const response = await fetch(`${INSPIRATION_ROUTE}/image/${encodeURIComponent(id)}`, { credentials: 'same-origin', signal: controller.signal, headers: { accept: 'image/*' } })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const blob = await readBoundedImageBlob(response, MAX_INSPIRATION_IMAGE_CACHE_BYTES)
      if (blob.size === 0) throw new Error('empty-image')
      if (response.headers.get('x-dsh-inspiration-fallback') !== '1') await cache.put(id, blob, blob.type)
      return blob
    }).then((blob) => {
      if (!active) return
      const objectUrl = URL.createObjectURL(blob)
      urlRef.current = objectUrl
      setUrl(objectUrl)
    }).catch(() => { if (active) setFailed(true) })
    return () => {
      active = false
      controller.abort()
      if (urlRef.current !== undefined) {
        URL.revokeObjectURL(urlRef.current)
        urlRef.current = undefined
      }
    }
  }, [id])
  return url && !failed ? <img src={url} alt={alt} loading="lazy" /> : <div className="dsh-ig-inspiration-placeholder">{failed ? '⚠️' : '…'}</div>
}

function readFavorites(): Set<string> {
  try {
    const value = JSON.parse(localStorage.getItem(FAVORITES_KEY) ?? '[]') as unknown
    return Array.isArray(value) ? new Set(value.filter((entry): entry is string => typeof entry === 'string')) : new Set()
  } catch { return new Set() }
}

function writeFavorites(value: Set<string>): void {
  try { localStorage.setItem(FAVORITES_KEY, JSON.stringify([...value])) } catch { /* restricted storage */ }
}

async function copyText(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(value)
  const input = document.createElement('textarea')
  input.value = value
  input.style.position = 'fixed'
  input.style.opacity = '0'
  document.body.appendChild(input)
  input.select()
  if (!document.execCommand('copy')) throw new Error('copy-failed')
  input.remove()
}

const INSPIRATION_STYLE = `
.dsh-ig-inspiration-page{height:100%;display:flex;flex-direction:column;overflow:hidden;background:var(--dsw-alias-bg-layer-1,#fff)}
.dsh-ig-inspiration-header{display:flex;justify-content:space-between;gap:14px;padding:16px;border-bottom:1px solid var(--dsw-alias-border-l2,#e5e7eb)}
.dsh-ig-inspiration-header h2{margin:0;font-size:17px}.dsh-ig-inspiration-header p{margin:5px 0 0;color:var(--dsw-alias-label-tertiary,#7b818b);font-size:12px}.dsh-ig-inspiration-header-actions,.dsh-ig-inspiration-actions{display:flex;gap:6px;flex-wrap:wrap}.dsh-ig-inspiration-page button{border:1px solid var(--dsw-alias-border-l2,#d7dbe0);border-radius:7px;background:var(--dsw-alias-bg-layer-2,#fff);color:inherit;padding:6px 9px;font:inherit;font-size:12px;cursor:pointer}.dsh-ig-inspiration-page button:hover,.dsh-ig-inspiration-page button.is-active{border-color:var(--dsw-alias-brand-primary,#4c78ff);color:var(--dsw-alias-brand-primary,#4c78ff)}
.dsh-ig-inspiration-toolbar{display:flex;gap:7px;align-items:center;flex-wrap:wrap;padding:10px 14px;border-bottom:1px solid var(--dsw-alias-border-l2,#e5e7eb)}.dsh-ig-inspiration-toolbar input,.dsh-ig-inspiration-toolbar select{border:1px solid var(--dsw-alias-border-l2,#d7dbe0);border-radius:7px;background:var(--dsw-alias-bg-layer-2,#fff);color:inherit;padding:6px 8px;font:inherit;font-size:12px}.dsh-ig-inspiration-toolbar input{flex:1;min-width:160px}.dsh-ig-inspiration-toolbar label{display:inline-flex;align-items:center;gap:4px;font-size:11px;color:var(--dsw-alias-label-tertiary,#7b818b)}
.dsh-ig-inspiration-body{display:grid;grid-template-columns:minmax(0,1fr) minmax(260px,32%);gap:12px;min-height:0;flex:1;overflow:hidden;padding:12px 14px}.dsh-ig-inspiration-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));align-content:start;gap:10px;overflow:auto;padding-right:3px}.dsh-ig-inspiration-card{padding:0!important;text-align:left;overflow:hidden}.dsh-ig-inspiration-card-media{position:relative;aspect-ratio:1/1;background:#f2f3f5}.dsh-ig-inspiration-card-media img{width:100%;height:100%;object-fit:cover;display:block}.dsh-ig-inspiration-card strong,.dsh-ig-inspiration-card small{display:block;padding:5px 8px 0}.dsh-ig-inspiration-card small{padding-top:2px;padding-bottom:8px;color:var(--dsw-alias-label-tertiary,#7b818b)}.dsh-ig-inspiration-card-favorite{position:absolute;right:6px;top:5px;color:#f5b301;background:rgba(0,0,0,.55);border-radius:50%;width:23px;height:23px;text-align:center;line-height:23px}.dsh-ig-inspiration-featured{position:absolute;left:6px;top:6px;background:rgba(0,0,0,.55);color:#fff;border-radius:5px;padding:3px 5px;font-size:10px}.dsh-ig-inspiration-placeholder{height:100%;display:grid;place-items:center;color:#a0a6af}.dsh-ig-inspiration-inspector{overflow:auto;border:1px solid var(--dsw-alias-border-l2,#e5e7eb);border-radius:10px;background:var(--dsw-alias-bg-layer-2,#fff)}.dsh-ig-inspiration-inspector>img{display:block;width:100%;aspect-ratio:1/1;object-fit:cover}.dsh-ig-inspiration-inspector-copy{padding:12px}.dsh-ig-inspiration-inspector-title{display:flex;align-items:center;justify-content:space-between}.dsh-ig-inspiration-inspector-title h3{margin:0;font-size:15px}.dsh-ig-inspiration-inspector-copy p{font-size:12px;line-height:1.45;color:var(--dsw-alias-label-tertiary,#7b818b)}.dsh-ig-inspiration-tags{display:flex;gap:5px;flex-wrap:wrap}.dsh-ig-inspiration-tags span{font-size:10px;padding:3px 5px;border-radius:4px;background:var(--dsw-alias-bg-layer-3,#eef1f4)}.dsh-ig-inspiration-prompt-label{display:grid;gap:5px;margin-top:10px;font-size:11px;font-weight:600}.dsh-ig-inspiration-prompt-label textarea{min-height:130px;resize:vertical;border:1px solid var(--dsw-alias-border-l2,#d7dbe0);border-radius:7px;background:var(--dsw-alias-bg-layer-1,#fff);color:inherit;padding:7px;font:inherit;font-size:11px;line-height:1.4}.dsh-ig-inspiration-empty{display:grid;place-items:center;align-content:center;gap:9px;min-height:260px;flex:1;color:var(--dsw-alias-label-tertiary,#7b818b);font-size:13px}.dsh-ig-inspiration-toast{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:100000;padding:7px 12px;border-radius:7px;background:rgba(0,0,0,.82);color:#fff;font-size:12px}
@media(max-width:800px){.dsh-ig-inspiration-body{grid-template-columns:1fr}.dsh-ig-inspiration-inspector{display:none}.dsh-ig-inspiration-header{flex-direction:column}}
`
