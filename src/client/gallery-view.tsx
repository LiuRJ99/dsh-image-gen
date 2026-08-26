/**
 * Native Workspace Gallery View Component for DSH `conversation.view` slot.
 * Fully i18n-reactive (Chinese & English) with multi-mode sorting, engine/ratio
 * filtering, grid/list/table view modes, localStorage preference persistence,
 * virtualized rendering, and thumbnail-vs-full image loading.
 */
import { useEffect, useMemo, useRef, useState, type FC } from 'react'
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import { IMAGE_ROUTE } from '../shared.js'
import {
  ASPECT_RATIO_FILTERS,
  SORT_OPTIONS,
  countByEngine,
  deleteGalleryItem,
  formatBytes,
  formatDate,
  formatResolution,
  galleryEngineLabel,
  getGalleryItems,
  processGalleryItems,
  subscribeGallery,
  type AspectRatioFilter,
  type GalleryItem,
  type SortOption,
  type ViewMode,
} from './gallery-store.js'
import { buildImageRequestBody, useGalleryImage } from './gallery-image.js'
import {
  GRID_GAP,
  LIST_ROW_HEIGHT,
  TABLE_HEADER_HEIGHT,
  TABLE_ROW_HEIGHT,
  gridCellWidth,
  gridColumns,
  gridRowHeight,
  useContainerWidth,
  useVirtualWindow,
} from './gallery-virtual.js'

export interface LocaleService {
  getSnapshot(): { active: string }
  subscribe(fn: () => void): () => void
}

const DICT = {
  zh: {
    galleryTitle: '画廊',
    totalCount: '共 {count} 张生成图片',
    searchPlaceholder: '搜索 Prompt 关键词…',
    clearSearch: '清空搜索',
    engineAll: '全部',
    filterGPT: 'GPT Image 2',
    filterGemini: 'Gemini Image',
    filterUnknown: '未知引擎',
    ratioFilter: '比例',
    ratioAll: '全部比例',
    sortBy: '排序',
    sortTimeDesc: '最新生成',
    sortTimeAsc: '最早生成',
    sortPromptAsc: 'Prompt A→Z',
    sortPromptDesc: 'Prompt Z→A',
    sortSizeDesc: '文件从大到小',
    viewGrid: '网格视图',
    viewList: '列表视图',
    viewTable: '表格视图',
    emptyTitle: '暂无生图记录',
    emptyDesc: '在对话中让 Agent 生图后，生成的图片会自动收录到这里。',
    noMatchTitle: '未找到匹配结果',
    noMatchDesc: '尝试更换搜索关键词或选择其他引擎。',
    copiedPrompt: '已复制 Prompt',
    copiedImage: '已复制图片',
    copyFailed: '复制失败',
    preview: '查看大图',
    download: '下载图片',
    copyImg: '复制图片',
    copyPpt: '复制 Prompt',
    delete: '从画廊删除',
    confirmDelete: '确定要从画廊中删除这张图片吗？（不会影响原聊天记录）',
    deleted: '已从画廊删除',
    prompt: 'Prompt',
    close: '关闭 (Esc)',
    prev: '上一张',
    next: '下一张',
    colPrompt: 'Prompt',
    colEngine: '引擎 / 模型',
    colResolution: '分辨率',
    colSize: '文件大小',
    colTime: '生成时间',
    colActions: '操作',
  },
  en: {
    galleryTitle: 'Gallery',
    totalCount: '{count} images total',
    searchPlaceholder: 'Search prompt keywords…',
    clearSearch: 'Clear search',
    engineAll: 'All',
    filterGPT: 'GPT Image 2',
    filterGemini: 'Gemini Image',
    filterUnknown: 'Unknown engine',
    ratioFilter: 'Aspect ratio',
    ratioAll: 'All ratios',
    sortBy: 'Sort',
    sortTimeDesc: 'Newest first',
    sortTimeAsc: 'Oldest first',
    sortPromptAsc: 'Prompt A→Z',
    sortPromptDesc: 'Prompt Z→A',
    sortSizeDesc: 'Largest file',
    viewGrid: 'Grid view',
    viewList: 'List view',
    viewTable: 'Table view',
    emptyTitle: 'No images generated yet',
    emptyDesc: 'Images generated during conversations will automatically appear here.',
    noMatchTitle: 'No matching images',
    noMatchDesc: 'Try a different search keyword or engine filter.',
    copiedPrompt: 'Prompt copied',
    copiedImage: 'Image copied',
    copyFailed: 'Copy failed',
    preview: 'Full Preview',
    download: 'Download',
    copyImg: 'Copy Image',
    copyPpt: 'Copy Prompt',
    delete: 'Delete from gallery',
    confirmDelete: 'Are you sure you want to remove this image from the gallery? (Chat history will not be affected)',
    deleted: 'Deleted from gallery',
    prompt: 'Prompt',
    close: 'Close (Esc)',
    prev: 'Previous',
    next: 'Next',
    colPrompt: 'Prompt',
    colEngine: 'Engine / Model',
    colResolution: 'Resolution',
    colSize: 'Size',
    colTime: 'Created',
    colActions: 'Actions',
  },
} as const

export type DictKey = keyof typeof DICT.zh
type Translate = (key: DictKey, params?: Record<string, string>) => string

const STORAGE_VIEW_KEY = 'dsh-image-gen:viewMode'
const STORAGE_SORT_KEY = 'dsh-image-gen:sortOption'

function safeStorageRead(key: string): string | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage.getItem(key)
  } catch {
    return null
  }
}

function safeStorageWrite(key: string, value: string): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, value)
  } catch {
    /* private mode / restricted environment: fall back to in-memory state */
  }
}

function isViewMode(value: string | null): value is ViewMode {
  return value === 'grid' || value === 'list' || value === 'table'
}

function isSortOption(value: string | null): value is SortOption {
  return (SORT_OPTIONS as readonly string[]).includes(value ?? '')
}

interface EngineFilterOption {
  value: string
  labelKey: DictKey
}

const ENGINE_FILTERS: readonly EngineFilterOption[] = [
  { value: 'all', labelKey: 'engineAll' },
  { value: 'gpt', labelKey: 'filterGPT' },
  { value: 'gemini', labelKey: 'filterGemini' },
  { value: 'unknown', labelKey: 'filterUnknown' },
]

export const GalleryViewTab: FC<{ locale?: LocaleService }> = ({ locale }) => {
  const [items, setItems] = useState<GalleryItem[]>([])
  const [search, setSearch] = useState('')
  const [selectedEngine, setSelectedEngine] = useState<string>('all')
  const [selectedRatio, setSelectedRatio] = useState<AspectRatioFilter>('all')
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const saved = safeStorageRead(STORAGE_VIEW_KEY)
    return isViewMode(saved) ? saved : 'grid'
  })
  const [sortOption, setSortOption] = useState<SortOption>(() => {
    const saved = safeStorageRead(STORAGE_SORT_KEY)
    return isSortOption(saved) ? (saved as SortOption) : 'time-desc'
  })
  const [previewId, setPreviewId] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [lang, setLang] = useState<'zh' | 'en'>(() => {
    const active = locale?.getSnapshot?.()?.active
    return active?.startsWith('en') ? 'en' : 'zh'
  })
  const bodyRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!locale?.subscribe) return
    return locale.subscribe(() => {
      const active = locale.getSnapshot?.()?.active
      setLang(active?.startsWith('en') ? 'en' : 'zh')
    })
  }, [locale])

  useEffect(() => {
    safeStorageWrite(STORAGE_VIEW_KEY, viewMode)
  }, [viewMode])

  useEffect(() => {
    safeStorageWrite(STORAGE_SORT_KEY, sortOption)
  }, [sortOption])

  const dict = lang === 'en' ? DICT.en : DICT.zh
  const t: Translate = (key, params) => {
    let text: string = dict[key] || DICT.zh[key] || key
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        text = text.replace(`{${k}}`, v)
      }
    }
    return text
  }

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => {
      setToast(null)
    }, 2000)
  }

  // Hide chat input composer while browsing gallery
  useEffect(() => {
    const seat = document.querySelector('[data-composer-seat]') as HTMLElement | null
    if (seat) {
      const prevDisplay = seat.style.display
      seat.style.display = 'none'
      return () => {
        seat.style.display = prevDisplay
      }
    }
  }, [])

  useEffect(() => {
    let active = true
    const load = () => {
      void getGalleryItems().then((res) => {
        if (active) setItems(res)
      })
    }
    load()
    const unsubscribe = subscribeGallery(load)
    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!previewId) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPreviewId(null)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [previewId])

  const processedItems = useMemo(
    () => processGalleryItems(items, { search, selectedEngine, selectedRatio, sortOption }),
    [items, search, selectedEngine, selectedRatio, sortOption],
  )

  const previewIndex = useMemo(() => {
    if (previewId === null) return -1
    return processedItems.findIndex((item) => item.id === previewId)
  }, [previewId, processedItems])

  const previewItem = previewIndex >= 0 ? processedItems[previewIndex] ?? null : null

  const openPreview = (item: GalleryItem) => {
    setPreviewId(item.id)
  }

  const closePreview = () => {
    setPreviewId(null)
  }

  const stepPreview = (delta: number) => {
    if (previewIndex < 0) return
    const next = processedItems[previewIndex + delta]
    if (next) setPreviewId(next.id)
  }

  // --- Virtualization layout -------------------------------------------------
  const bodyWidth = useContainerWidth(bodyRef)
  const contentWidth = Math.max(0, bodyWidth - 56) // body padding 28px each side
  const columns = viewMode === 'grid' ? gridColumns(contentWidth) : 1
  const cellWidth = gridCellWidth(contentWidth, columns)
  const rowHeight = viewMode === 'grid' ? gridRowHeight(cellWidth) : viewMode === 'list' ? LIST_ROW_HEIGHT : TABLE_ROW_HEIGHT
  const rowCount = viewMode === 'grid' ? Math.ceil(processedItems.length / columns) : processedItems.length
  const offsetTop = viewMode === 'table' ? TABLE_HEADER_HEIGHT : 0
  const win = useVirtualWindow(bodyRef, rowCount, rowHeight, offsetTop)

  const visibleStart = viewMode === 'grid' ? win.start * columns : win.start
  const visibleEnd = viewMode === 'grid' ? Math.min(win.end * columns, processedItems.length) : win.end
  const visibleItems = useMemo(
    () => processedItems.slice(visibleStart, visibleEnd),
    [processedItems, visibleStart, visibleEnd],
  )
  const visibleGridRows = useMemo(() => {
    if (viewMode !== 'grid') return []
    const rows: GalleryItem[][] = []
    for (let r = win.start; r < win.end; r++) {
      rows.push(processedItems.slice(r * columns, r * columns + columns))
    }
    return rows
  }, [processedItems, win.start, win.end, columns, viewMode])

  return (
    <div className="dsh-ig-gallery-page">
      {/* Top Toolbar */}
      <header className="dsh-ig-gallery-page-header">
        <div className="dsh-ig-gallery-page-top">
          <div className="dsh-ig-gallery-page-title-row">
            <span className="dsh-ig-gallery-page-title">🖼️ {t('galleryTitle')}</span>
            <span className="dsh-ig-gallery-page-count">
              {t('totalCount', { count: String(items.length) })}
            </span>
          </div>

          {/* View mode toggle */}
          <div className="dsh-ig-gallery-view-toggle" role="group" aria-label={t('viewGrid')}>
            <button
              type="button"
              className={`dsh-ig-view-toggle-btn ${viewMode === 'grid' ? 'is-active' : ''}`}
              title={t('viewGrid')}
              aria-pressed={viewMode === 'grid'}
              onClick={() => setViewMode('grid')}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
            </button>
            <button
              type="button"
              className={`dsh-ig-view-toggle-btn ${viewMode === 'list' ? 'is-active' : ''}`}
              title={t('viewList')}
              aria-pressed={viewMode === 'list'}
              onClick={() => setViewMode('list')}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/></svg>
            </button>
            <button
              type="button"
              className={`dsh-ig-view-toggle-btn ${viewMode === 'table' ? 'is-active' : ''}`}
              title={t('viewTable')}
              aria-pressed={viewMode === 'table'}
              onClick={() => setViewMode('table')}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="9" y1="10" x2="9" y2="20"/></svg>
            </button>
          </div>
        </div>

        {/* Engine category pills with dynamic counts */}
        <div className="dsh-ig-gallery-pills" role="tablist" aria-label={t('engineAll')}>
          {ENGINE_FILTERS.map((filter) => (
            <button
              key={filter.value}
              type="button"
              role="tab"
              aria-selected={selectedEngine === filter.value}
              className={`dsh-ig-gallery-pill ${selectedEngine === filter.value ? 'is-active' : ''}`}
              onClick={() => setSelectedEngine(filter.value)}
            >
              <span>{t(filter.labelKey)}</span>
              <span className="dsh-ig-gallery-pill-badge">{countByEngine(items, filter.value)}</span>
            </button>
          ))}
        </div>

        {/* Search + ratio + sort controls */}
        <div className="dsh-ig-gallery-page-tools">
          <div className="dsh-ig-gallery-search-wrap">
            <svg
              className="dsh-ig-gallery-search-icon"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              className="dsh-ig-gallery-search-input"
              placeholder={t('searchPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search !== '' && (
              <button
                type="button"
                className="dsh-ig-gallery-search-clear"
                title={t('clearSearch')}
                aria-label={t('clearSearch')}
                onClick={() => setSearch('')}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            )}
          </div>

          <label className="dsh-ig-gallery-select-wrap">
            <span className="dsh-ig-gallery-select-label">{t('ratioFilter')}</span>
            <select
              className="dsh-ig-gallery-select"
              value={selectedRatio}
              onChange={(e) => setSelectedRatio(e.target.value as AspectRatioFilter)}
            >
              {ASPECT_RATIO_FILTERS.map((ratio) => (
                <option key={ratio} value={ratio}>
                  {ratio === 'all' ? t('ratioAll') : ratio}
                </option>
              ))}
            </select>
          </label>

          <label className="dsh-ig-gallery-select-wrap">
            <span className="dsh-ig-gallery-select-label">{t('sortBy')}</span>
            <select
              className="dsh-ig-gallery-select"
              value={sortOption}
              onChange={(e) => setSortOption(e.target.value as SortOption)}
            >
              <option value="time-desc">{t('sortTimeDesc')}</option>
              <option value="time-asc">{t('sortTimeAsc')}</option>
              <option value="prompt-asc">{t('sortPromptAsc')}</option>
              <option value="prompt-desc">{t('sortPromptDesc')}</option>
              <option value="size-desc">{t('sortSizeDesc')}</option>
            </select>
          </label>
        </div>
      </header>

      {/* Content */}
      <div className="dsh-ig-gallery-page-body" ref={bodyRef}>
        {items.length === 0 ? (
          <div className="dsh-ig-gallery-empty">
            <div className="dsh-ig-gallery-empty-icon">🖼️</div>
            <div className="dsh-ig-gallery-empty-title">{t('emptyTitle')}</div>
            <div className="dsh-ig-gallery-empty-desc">{t('emptyDesc')}</div>
          </div>
        ) : processedItems.length === 0 ? (
          <div className="dsh-ig-gallery-empty">
            <div className="dsh-ig-gallery-empty-icon">🔍</div>
            <div className="dsh-ig-gallery-empty-title">{t('noMatchTitle')}</div>
            <div className="dsh-ig-gallery-empty-desc">{t('noMatchDesc')}</div>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="dsh-ig-gallery-virtual" style={{ position: 'relative', height: win.totalHeight }}>
            {visibleGridRows.map((rowItems, ri) => {
              const rowIndex = win.start + ri
              return (
                <div
                  key={rowIndex}
                  className="dsh-ig-gallery-grid-row"
                  style={{
                    top: rowIndex * rowHeight,
                    height: rowHeight - GRID_GAP,
                    gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                  }}
                >
                  {rowItems.map((item) => (
                    <GalleryGridCard
                      key={item.id}
                      item={item}
                      lang={lang}
                      t={t}
                      onPreview={openPreview}
                      onToast={showToast}
                    />
                  ))}
                </div>
              )
            })}
          </div>
        ) : viewMode === 'list' ? (
          <div className="dsh-ig-gallery-virtual" style={{ position: 'relative', height: win.totalHeight }}>
            {visibleItems.map((item, i) => {
              const index = visibleStart + i
              return (
                <div
                  key={item.id}
                  className="dsh-ig-gallery-list-virtual-item"
                  style={{ top: index * LIST_ROW_HEIGHT, height: LIST_ROW_HEIGHT - 12 }}
                >
                  <GalleryListItem
                    item={item}
                    lang={lang}
                    t={t}
                    onPreview={openPreview}
                    onToast={showToast}
                  />
                </div>
              )
            })}
          </div>
        ) : (
          <div className="dsh-ig-gallery-table-wrap">
            <table className="dsh-ig-gallery-table">
              <thead>
                <tr>
                  <th className="dsh-ig-table-th-thumb" />
                  <th>{t('colPrompt')}</th>
                  <th>{t('colEngine')}</th>
                  <th>{t('colResolution')}</th>
                  <th>{t('colSize')}</th>
                  <th>{t('colTime')}</th>
                  <th>{t('colActions')}</th>
                </tr>
              </thead>
              <tbody>
                {win.padTop > 0 && <tr className="dsh-ig-gallery-spacer" style={{ height: win.padTop }}><td colSpan={7} /></tr>}
                {visibleItems.map((item) => (
                  <GalleryTableRow
                    key={item.id}
                    item={item}
                    lang={lang}
                    t={t}
                    onPreview={openPreview}
                    onToast={showToast}
                  />
                ))}
                {win.padBottom > 0 && <tr className="dsh-ig-gallery-spacer" style={{ height: win.padBottom }}><td colSpan={7} /></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {toast && <div className="dsh-ig-gallery-page-toast">{toast}</div>}

      {/* Pure Centered Lightbox Preview with prev/next navigation (full image) */}
      {previewItem && (
        <GalleryLightbox
          item={previewItem}
          index={previewIndex}
          total={processedItems.length}
          t={t}
          onPrev={() => stepPreview(-1)}
          onNext={() => stepPreview(1)}
          onClose={closePreview}
          onToast={showToast}
        />
      )}
    </div>
  )
}

/** Pure centered lightbox with self-loaded full image, prev/next nav, and a position counter. */
const GalleryLightbox: FC<{
  item: GalleryItem
  index: number
  total: number
  t: Translate
  onPrev: () => void
  onNext: () => void
  onClose: () => void
  onToast: (msg: string) => void
}> = ({ item, index, total, t, onPrev, onNext, onClose, onToast }) => {
  const { url, blob, loading, error } = useGalleryImage(item.attachment, 'full')

  // Arrow-key navigation while the lightbox is open.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') onPrev()
      else if (e.key === 'ArrowRight') onNext()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onPrev, onNext])

  const hasPrev = index > 0
  const hasNext = index >= 0 && index < total - 1

  return (
    <div className="dsh-ig-lightbox-backdrop" onClick={onClose}>
      <div className="dsh-ig-lightbox-topbar" onClick={(e) => e.stopPropagation()}>
        <div className="dsh-ig-lightbox-meta">
          <span className="dsh-ig-tag" title={item.normalizationError}>{galleryEngineLabel(item.engine)}</span>
          <span className="dsh-ig-lightbox-meta-text">{formatResolution(item)}</span>
          <span className="dsh-ig-lightbox-meta-text">{formatBytes(item.attachment?.bytes)}</span>
          {index >= 0 && <span className="dsh-ig-lightbox-meta-text">{index + 1} / {total}</span>}
        </div>
        <button type="button" className="dsh-ig-lightbox-close-btn" title={t('close')} onClick={onClose}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      {/* Prev / Next side buttons */}
      {hasPrev && (
        <button type="button" className="dsh-ig-lightbox-nav dsh-ig-lightbox-nav-prev" title={t('prev')} onClick={(e) => { e.stopPropagation(); onPrev() }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
      )}
      {hasNext && (
        <button type="button" className="dsh-ig-lightbox-nav dsh-ig-lightbox-nav-next" title={t('next')} onClick={(e) => { e.stopPropagation(); onNext() }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
      )}

      <div className="dsh-ig-lightbox-img-wrap" onClick={(e) => e.stopPropagation()}>
        {loading && <div className="dsh-ig-lightbox-loading">…</div>}
        {error && <div className="dsh-ig-lightbox-error">⚠️ {error}</div>}
        {url && <img className="dsh-ig-lightbox-img" src={url} alt={item.prompt} />}
      </div>

      <div className="dsh-ig-lightbox-bottombar" onClick={(e) => e.stopPropagation()}>
        <div className="dsh-ig-lightbox-prompt-text" title={item.prompt}>{item.prompt}</div>
        <div className="dsh-ig-lightbox-actions">
          <button type="button" className="dsh-ig-lightbox-btn" title={t('copyPpt')} onClick={() => { void handleCopyPrompt(item, t, onToast) }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>
            <span>{t('copyPpt')}</span>
          </button>
          <button type="button" className="dsh-ig-lightbox-btn" title={t('copyImg')} onClick={() => { if (blob) void handleCopyImage(blob, t, onToast) }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            <span>{t('copyImg')}</span>
          </button>
          <button type="button" className="dsh-ig-lightbox-btn" title={t('download')} onClick={() => { if (url) handleDownload(item, url) }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            <span>{t('download')}</span>
          </button>
          <button type="button" className="dsh-ig-lightbox-btn dsh-ig-lightbox-btn-danger" title={t('delete')} onClick={() => { void handleDelete(item, t, onToast); onClose() }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
            <span>{t('delete')}</span>
          </button>
        </div>
      </div>
    </div>
  )
}

interface ViewItemProps {
  item: GalleryItem
  lang: 'zh' | 'en'
  t: Translate
  onPreview: (item: GalleryItem) => void
  onToast: (msg: string) => void
}

/** Grid card: visual-first thumbnail with floating quick actions. */
const GalleryGridCard: FC<ViewItemProps> = ({ item, t, onPreview, onToast }) => {
  const { url, loading, error } = useGalleryImage(item.attachment, 'thumb')

  return (
    <div
      className="dsh-ig-gallery-card"
      onClick={() => {
        if (url) onPreview(item)
      }}
    >
      <div className="dsh-ig-gallery-card-media">
        {loading && <div className="dsh-ig-gallery-card-loading">...</div>}
        {error && <div className="dsh-ig-gallery-card-error">⚠️ {error}</div>}
        {url && (
          <img className="dsh-ig-gallery-card-img" src={url} alt={item.prompt} loading="lazy" decoding="async" />
        )}

        <div className="dsh-ig-card-toolbar">
          <button type="button" className="dsh-ig-tool-btn" title={t('copyImg')} onClick={(e) => { e.stopPropagation(); void handleCopyImageFull(item, t, onToast) }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          </button>
          <button type="button" className="dsh-ig-tool-btn" title={t('download')} onClick={(e) => { e.stopPropagation(); void handleDownloadFull(item, t, onToast) }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          </button>
          <button type="button" className="dsh-ig-tool-btn" title={t('copyPpt')} onClick={(e) => { e.stopPropagation(); void handleCopyPrompt(item, t, onToast) }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>
          </button>
          <button type="button" className="dsh-ig-tool-btn dsh-ig-tool-btn-danger" title={t('delete')} onClick={(e) => { e.stopPropagation(); void handleDelete(item, t, onToast) }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
          </button>
        </div>
      </div>

      <div className="dsh-ig-gallery-card-meta">
        <div className="dsh-ig-gallery-card-header">
          <span className="dsh-ig-tag" title={item.normalizationError}>{galleryEngineLabel(item.engine)}</span>
        </div>
        <p className="dsh-ig-gallery-card-prompt" title={item.prompt}>{item.prompt}</p>
      </div>
    </div>
  )
}

/** List row: horizontal thumbnail + full prompt + metadata + action bar. */
const GalleryListItem: FC<ViewItemProps> = ({ item, lang, t, onPreview, onToast }) => {
  const { url, loading, error } = useGalleryImage(item.attachment, 'thumb')

  return (
    <div
      className="dsh-ig-gallery-list-item"
      onClick={() => {
        if (url) onPreview(item)
      }}
    >
      <div className="dsh-ig-gallery-list-thumb">
        {loading && <div className="dsh-ig-gallery-card-loading">...</div>}
        {error && <div className="dsh-ig-gallery-card-error">⚠️</div>}
        {url && <img src={url} alt={item.prompt} loading="lazy" decoding="async" />}
      </div>

      <div className="dsh-ig-gallery-list-main">
        <div className="dsh-ig-gallery-list-tags">
          <span className="dsh-ig-tag" title={item.normalizationError}>{galleryEngineLabel(item.engine)}</span>
          {item.model && <span className="dsh-ig-tag dsh-ig-tag-muted">{item.model}</span>}
        </div>
        <p className="dsh-ig-gallery-list-prompt" title={item.prompt}>{item.prompt}</p>
        <div className="dsh-ig-gallery-list-meta">
          <span title={t('colResolution')}>{formatResolution(item)}</span>
          <span title={t('colSize')}>{formatBytes(item.attachment?.bytes)}</span>
          <span title={t('colTime')}>{formatDate(item.createdAt, lang)}</span>
        </div>
      </div>

      <GalleryActionsBar item={item} t={t} onToast={onToast} />
    </div>
  )
}

const GalleryTableRow: FC<ViewItemProps> = ({ item, lang, t, onPreview, onToast }) => {
  const { url, loading, error } = useGalleryImage(item.attachment, 'thumb')

  return (
    <tr
      className="dsh-ig-gallery-table-row"
      onClick={() => {
        if (url) onPreview(item)
      }}
    >
      <td className="dsh-ig-table-cell-thumb">
        <div className="dsh-ig-gallery-table-thumb">
          {loading && <div className="dsh-ig-gallery-card-loading">...</div>}
          {error && <div className="dsh-ig-gallery-card-error">⚠️</div>}
          {url && <img src={url} alt={item.prompt} loading="lazy" decoding="async" />}
        </div>
      </td>
      <td className="dsh-ig-table-cell-prompt">
        <span className="dsh-ig-gallery-table-prompt" title={item.prompt}>{item.prompt}</span>
      </td>
      <td>
        <div className="dsh-ig-gallery-table-engine">
          <span className="dsh-ig-tag" title={item.normalizationError}>{galleryEngineLabel(item.engine)}</span>
          {item.model && <span className="dsh-ig-table-model">{item.model}</span>}
        </div>
      </td>
      <td>{formatResolution(item) || '—'}</td>
      <td>{formatBytes(item.attachment?.bytes)}</td>
      <td>{formatDate(item.createdAt, lang)}</td>
      <td onClick={(e) => e.stopPropagation()}>
        <GalleryActionsBar item={item} t={t} onToast={onToast} />
      </td>
    </tr>
  )
}

/** Inline icon action bar shared by list and table views. */
const GalleryActionsBar: FC<{
  item: GalleryItem
  t: Translate
  onToast: (msg: string) => void
}> = ({ item, t, onToast }) => {
  return (
    <div className="dsh-ig-gallery-actions-row">
      <button type="button" className="dsh-ig-action-btn" title={t('copyPpt')} onClick={(e) => { e.stopPropagation(); void handleCopyPrompt(item, t, onToast) }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>
      </button>
      <button type="button" className="dsh-ig-action-btn" title={t('copyImg')} onClick={(e) => { e.stopPropagation(); void handleCopyImageFull(item, t, onToast) }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
      </button>
      <button type="button" className="dsh-ig-action-btn" title={t('download')} onClick={(e) => { e.stopPropagation(); void handleDownloadFull(item, t, onToast) }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
      </button>
      <button type="button" className="dsh-ig-action-btn dsh-ig-action-btn-danger" title={t('delete')} onClick={(e) => { e.stopPropagation(); void handleDelete(item, t, onToast) }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
      </button>
    </div>
  )
}

async function handleCopyPrompt(item: GalleryItem, t: Translate, onToast: (msg: string) => void): Promise<void> {
  try {
    await navigator.clipboard.writeText(item.prompt)
    onToast(t('copiedPrompt'))
  } catch {
    onToast(t('copyFailed'))
  }
}

async function handleCopyImage(blob: Blob, t: Translate, onToast: (msg: string) => void): Promise<void> {
  const ok = await copyImageBlob(blob)
  onToast(ok ? t('copiedImage') : t('copyFailed'))
}

async function handleDelete(item: GalleryItem, t: Translate, onToast: (msg: string) => void): Promise<void> {
  if (!window.confirm(t('confirmDelete'))) return
  await deleteGalleryItem(item.id)
  onToast(t('deleted'))
}

function handleDownload(item: GalleryItem, url: string): void {
  const a = document.createElement('a')
  a.href = url
  a.download = `dsh-${item.engine}-${item.id}.png`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

/** Lazily fetch the full-resolution bytes for a card's copy/download action. */
async function fetchFullImage(ref: ImageAttachmentRef): Promise<Blob> {
  const response = await fetch(IMAGE_ROUTE, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: buildImageRequestBody(ref, 'full', 0),
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.blob()
}

async function handleDownloadFull(item: GalleryItem, t: Translate, onToast: (msg: string) => void): Promise<void> {
  try {
    const blob = await fetchFullImage(item.attachment)
    const url = URL.createObjectURL(blob)
    handleDownload(item, url)
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  } catch {
    onToast(t('copyFailed'))
  }
}

async function handleCopyImageFull(item: GalleryItem, t: Translate, onToast: (msg: string) => void): Promise<void> {
  try {
    const blob = await fetchFullImage(item.attachment)
    await handleCopyImage(blob, t, onToast)
  } catch {
    onToast(t('copyFailed'))
  }
}

export async function copyImageBlob(blob: Blob): Promise<boolean> {
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
    const pngBlob = await new Promise<Blob | null>((res) => {
      canvas.toBlob(res, 'image/png')
    })
    if (!pngBlob) throw new Error('Blob conversion failed')
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })])
    return true
  } catch (_err) {
    return false
  }
}
