/**
 * Native Workspace Gallery View Component for DSH `conversation.view` slot.
 * Fully i18n-reactive (Chinese & English) with multi-mode sorting, engine/ratio
 * filtering, grid/list/table view modes, localStorage preference persistence,
 * virtualized rendering, and thumbnail-vs-full image loading.
 */
import { useEffect, useMemo, useRef, useState, type FC } from 'react'
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import { CPA_GENERATE_ROUTE, DELETE_ROUTE, IMAGE_ROUTE, WORKSPACES_ROUTE, imageAttachment, type ImageEngine } from '../shared.js'
import { gptSizeFromAspectRatio, normalizeGeminiAspectRatio, normalizeGeminiImageSize } from '../engine-options.js'
import {
  ASPECT_RATIO_FILTERS,
  SORT_OPTIONS,
  countByEngine,
  deleteGalleryItem,
  bulkDeleteGalleryItems,
  isItemInWorkspace,
  toggleFavoriteGalleryItem,
  formatBytes,
  formatDate,
  formatResolution,
  galleryEngineLabel,
  getGalleryItems,
  normalizeGalleryItem,
  normalizeWorkspacePath,
  saveGalleryItem,
  processGalleryItems,
  subscribeGallery,
  type AspectRatioFilter,
  type GalleryItem,
  type SortOption,
  type ViewMode,
} from './gallery-store.js'
import { buildImageRequestBody, useGalleryImage } from './gallery-image.js'
import { InspirationView } from './inspiration-view.js'
import {
  BODY_PADDING_X,
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
    inspiration: '灵感',
    favoritesOnly: '仅收藏',
    manage: '批量管理',
    exitManage: '退出管理',
    selectedCount: '已选 {count} 项',
    selectAll: '全选',
    clearSelect: '清空选择',
    batchDelete: '批量删除',
    confirmBatchDelete: '确定删除选中的 {count} 张图片吗？（不会影响聊天记录）',
    deleteWorkspaceFilesOpt: '同时清理工作区生成文件（不可恢复）',
    workspaceOnly: '当前工作区',
    workspaceAll: '所有工作区',
    workspaceUnavailable: '当前工作区（需要会话范围）',
    regenerate: '重新生成',
    regenerating: '生成中…',
    regenerateSuccess: '已生成新图片',
    regenerateFailed: '重新生成失败',
    usePrompt: '使用 Prompt',
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
    favoriteAdded: '已添加到收藏',
    favoriteRemoved: '已取消收藏',
    preview: '查看大图',
    download: '下载图片',
    copyImg: '复制图片',
    copyPpt: '复制 Prompt',
    delete: '从画廊删除',
    confirmDelete: '确定要从画廊中删除这张图片吗？（不会影响原聊天记录）',
    deleted: '已从画廊删除',
    deleteFailed: '工作区文件清理失败，未删除画廊记录',
    confirmDeleteWorkspace: '同时删除这张图片的工作区文件吗？此操作不可恢复。',
    prompt: 'Prompt',
    close: '关闭 (Esc)',
    prev: '上一张',
    next: '下一张',
    colPrompt: 'Prompt',
    colEngine: '引擎',
    colResolution: '分辨率',
    colSize: '文件大小',
    colTime: '生成时间',
    colActions: '操作',
  },
  en: {
    galleryTitle: 'Gallery',
    inspiration: 'Inspiration',
    favoritesOnly: 'Favorites',
    manage: 'Batch manage',
    exitManage: 'Done',
    selectedCount: '{count} selected',
    selectAll: 'Select all',
    clearSelect: 'Clear selection',
    batchDelete: 'Delete selected',
    confirmBatchDelete: 'Delete {count} selected images? (Chat history is not affected)',
    deleteWorkspaceFilesOpt: 'Also delete generated workspace files (cannot be undone)',
    workspaceOnly: 'Current workspace',
    workspaceAll: 'All workspaces',
    workspaceUnavailable: 'Current workspace (session scope required)',
    regenerate: 'Regenerate',
    regenerating: 'Generating…',
    regenerateSuccess: 'New image generated',
    regenerateFailed: 'Regeneration failed',
    usePrompt: 'Use prompt',
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
    favoriteAdded: 'Added to favorites',
    favoriteRemoved: 'Removed from favorites',
    preview: 'Full Preview',
    download: 'Download',
    copyImg: 'Copy Image',
    copyPpt: 'Copy Prompt',
    delete: 'Delete from gallery',
    confirmDelete: 'Are you sure you want to remove this image from the gallery? (Chat history will not be affected)',
    deleted: 'Deleted from gallery',
    deleteFailed: 'Workspace cleanup failed; gallery record was kept',
    confirmDeleteWorkspace: 'Also delete this image\'s workspace file? This cannot be undone.',
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
export type GalleryTab = 'gallery' | 'inspiration'

type WorkspaceContext = {
  workspaceId?: string
  path?: string
  title?: string
  sessionIds?: readonly string[]
}

const STORAGE_VIEW_KEY = 'dsh-image-gen:viewMode'
const STORAGE_SORT_KEY = 'dsh-image-gen:sortOption'
const STORAGE_WORKSPACE_ONLY_KEY = 'dsh-image-gen:workspaceOnly'

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

export interface GalleryViewTabProps {
  locale?: LocaleService | undefined
  scope?: { sessionId: string; cwd?: string | undefined; repoRoot?: string | undefined } | undefined
  visible?: boolean | undefined
}

export const GalleryViewTab: FC<GalleryViewTabProps> = ({ locale, scope, visible: _visible }) => {
  const [activeTab, setActiveTab] = useState<GalleryTab>('gallery')
  const [items, setItems] = useState<GalleryItem[]>([])
  const [search, setSearch] = useState('')
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const [workspaceOnly, setWorkspaceOnly] = useState(() => safeStorageRead(STORAGE_WORKSPACE_ONLY_KEY) === 'true')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [manageMode, setManageMode] = useState(false)
  const [deleteWorkspaceFiles, setDeleteWorkspaceFiles] = useState(false)
  const [workspaceRecords, setWorkspaceRecords] = useState<WorkspaceContext[]>([])
  const [generating, setGenerating] = useState(false)
  const generatingRef = useRef(false)
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
  const galleryLoadIdRef = useRef(0)

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

  useEffect(() => {
    safeStorageWrite(STORAGE_WORKSPACE_ONLY_KEY, String(workspaceOnly))
  }, [workspaceOnly])

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

  useEffect(() => {
    let active = true
    void fetch(WORKSPACES_ROUTE, { credentials: 'same-origin' })
      .then(async (response) => response.ok ? await response.json() as unknown : undefined)
      .then((value) => {
        if (!active) return
        const rows = recordArray(value, 'workspaces')
        setWorkspaceRecords((rows ?? []).map((row) => ({
          ...(typeof row.workspaceId === 'string' ? { workspaceId: row.workspaceId } : {}),
          ...(typeof row.path === 'string' ? { path: row.path } : {}),
          ...(typeof row.title === 'string' ? { title: row.title } : {}),
          ...(Array.isArray(row.sessionIds) ? { sessionIds: row.sessionIds.filter((id): id is string => typeof id === 'string') } : {}),
        })))
      })
      .catch(() => {})
    return () => { active = false }
  }, [])

  const activeWorkspace = useMemo<WorkspaceContext | null>(() => {
    const sessionId = scope?.sessionId
    const cwd = scope?.cwd
    const bySession = sessionId === undefined ? undefined : workspaceRecords.find((workspace) => workspace.sessionIds?.includes(sessionId))
    if (bySession) return bySession
    const byPath = cwd === undefined ? undefined : workspaceRecords.find((workspace) => workspace.path !== undefined && normalizeWorkspacePath(workspace.path) === normalizeWorkspacePath(cwd))
    if (byPath) return byPath
    if (cwd !== undefined || sessionId !== undefined) return { ...(cwd === undefined ? {} : { path: cwd }), ...(sessionId === undefined ? {} : { sessionIds: [sessionId] }) }
    // Do not guess a workspace when the host did not provide a session scope.
    return null
  }, [scope?.cwd, scope?.sessionId, workspaceRecords])

  const workspaceScopeKey = activeWorkspace === null
    ? 'none'
    : `${activeWorkspace.workspaceId ?? ''}|${activeWorkspace.path ?? ''}|${activeWorkspace.sessionIds?.join('\u0000') ?? ''}`

  useEffect(() => {
    setSelectedIds(new Set())
    setManageMode(false)
  }, [activeTab, favoritesOnly, workspaceOnly, search, selectedEngine, selectedRatio, sortOption, workspaceScopeKey])

  const reloadItems = () => {
    const currentRequest = ++galleryLoadIdRef.current
    void getGalleryItems().then((res) => {
      if (currentRequest === galleryLoadIdRef.current) setItems(res)
    })
  }

  const toggleFavorite = async (item: GalleryItem): Promise<void> => {
    const next = await toggleFavoriteGalleryItem(item.id)
    if (next === undefined) showToast(t('deleteFailed'))
    else showToast(next ? t('favoriteAdded') : t('favoriteRemoved'))
  }

  const toggleSelected = (item: GalleryItem): void => {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(item.id)) next.delete(item.id)
      else next.add(item.id)
      return next
    })
  }

  const selectAllVisible = (): void => {
    setSelectedIds(new Set(processedItems.map((item) => item.id)))
  }

  const deleteSelected = async (): Promise<void> => {
    const ids = [...selectedIds]
    if (ids.length === 0 || !window.confirm(t('confirmBatchDelete', { count: String(ids.length) }))) return
    const selectedItems = items.filter((item) => selectedIds.has(item.id))
    try {
      if (deleteWorkspaceFiles) {
        const paths = selectedItems.flatMap((item) => typeof item.savedTo === 'string' && isCanonicalSavedToPath(item.savedTo) ? [item.savedTo] : [])
        const response = await fetch(DELETE_ROUTE, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ paths }),
        })
        const payload = await response.json().catch(() => null) as { ok?: unknown; failedFiles?: unknown } | null
        if (!response.ok || payload?.ok !== true || (Array.isArray(payload.failedFiles) && payload.failedFiles.length > 0)) {
          throw new Error('workspace-delete-failed')
        }
      }
      await bulkDeleteGalleryItems(ids)
      setSelectedIds(new Set())
      setManageMode(false)
      showToast(t('deleted'))
      reloadItems()
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : String(cause))
    }
  }

  const generateThroughCpa = async (prompt: string, engine: ImageEngine, source?: GalleryItem): Promise<GalleryItem> => {
    if (generatingRef.current) throw new Error('generation-in-progress')
    generatingRef.current = true
    setGenerating(true)
    try {
      const sourceOutput = typeof source?.output === 'string' ? source.output : ''
      const sourceSize = sourceOutput.match(/\b(?:1024x1024|1024x1792|1792x1024)\b/)?.[0] ?? gptSizeFromAspectRatio(source?.aspectRatio)
      const sourceAspectRatio = normalizeGeminiAspectRatio(source?.aspectRatio) ?? normalizeGeminiAspectRatio(sourceOutput.match(/\b(?:1:1|16:9|9:16|4:3|3:4|3:2|2:3)\b/)?.[0])
      const sourceImageSize = normalizeGeminiImageSize(source?.imageSize) ?? normalizeGeminiImageSize(sourceOutput.match(/\b(?:1K|2K|4K)\b/)?.[0])
      const response = await fetch(CPA_GENERATE_ROUTE, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          engine,
          ...(typeof source?.model === 'string' && source.model.trim() !== '' ? { model: source.model.trim() } : {}),
          prompt,
          ...(engine === 'gpt'
            ? (sourceSize === undefined ? {} : { size: sourceSize })
            : {
                ...(sourceAspectRatio === undefined ? {} : { aspect_ratio: sourceAspectRatio }),
                ...(sourceImageSize === undefined ? {} : { image_size: sourceImageSize }),
              }),
        }),
      })
      const payload = await response.json().catch(() => null) as Record<string, unknown> | null
      const attachment = imageAttachment(payload?.attachment)
      if (!response.ok || attachment === undefined) throw new Error(typeof payload?.error === 'string' ? payload.error : t('regenerateFailed'))
      const workspacePath = activeWorkspace?.path ?? scope?.cwd
      const item = normalizeGalleryItem({
        id: attachment.attachmentId,
        attachment,
        prompt,
        engine,
        model: typeof payload?.model === 'string' ? payload.model : (source?.model ?? ''),
        ...(typeof payload?.output === 'string' ? { output: payload.output } : {}),
        ...(typeof payload?.aspectRatio === 'string' ? { aspectRatio: payload.aspectRatio } : {}),
        ...(typeof payload?.imageSize === 'string' ? { imageSize: payload.imageSize } : {}),
        ...(typeof payload?.savedTo === 'string' ? { savedTo: payload.savedTo } : {}),
        ...(workspacePath === undefined ? {} : { workspacePath }),
        ...(activeWorkspace?.workspaceId === undefined ? {} : { workspaceId: activeWorkspace.workspaceId }),
        ...(scope?.sessionId === undefined ? {} : { sessionId: scope.sessionId }),
        createdAt: typeof payload?.createdAt === 'number' ? payload.createdAt : Date.now(),
      })
      await saveGalleryItem(item)
      reloadItems()
      return item
    } finally {
      generatingRef.current = false
      setGenerating(false)
    }
  }

  const regenerateItem = async (item: GalleryItem): Promise<void> => {
    if (generating || (item.engine !== 'gpt' && item.engine !== 'gemini')) {
      showToast(t('regenerateFailed'))
      return
    }
    const prompt = window.prompt(t('usePrompt'), item.prompt)
    if (prompt === null || prompt.trim() === '') return
    try {
      await generateThroughCpa(prompt, item.engine, item)
      showToast(t('regenerateSuccess'))
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : t('regenerateFailed'))
    }
  }

  useEffect(() => {
    let active = true
    const load = () => {
      const currentRequest = ++galleryLoadIdRef.current
      void getGalleryItems().then((res) => {
        if (active && currentRequest === galleryLoadIdRef.current) setItems(res)
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

  const workspaceFilteredItems = useMemo(() => {
    return items.filter((item) => {
      if (favoritesOnly && item.isFavorite !== true) return false
      if (workspaceOnly && activeWorkspace !== null && !isItemInWorkspace(item, activeWorkspace)) return false
      return true
    })
  }, [items, favoritesOnly, workspaceOnly, activeWorkspace])

  const processedItems = useMemo(
    () => processGalleryItems(workspaceFilteredItems, { search, selectedEngine, selectedRatio, sortOption }),
    [workspaceFilteredItems, search, selectedEngine, selectedRatio, sortOption],
  )

  useEffect(() => {
    if (viewMode !== 'list') bodyRef.current?.scrollTo({ top: 0 })
  }, [viewMode, search, selectedEngine, selectedRatio, sortOption, workspaceOnly, favoritesOnly])

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
  const contentWidth = Math.max(0, bodyWidth - BODY_PADDING_X * 2)
  const columns = viewMode === 'grid' ? gridColumns(contentWidth) : 1
  const cellWidth = gridCellWidth(contentWidth, columns)
  const rowHeight = viewMode === 'grid' ? gridRowHeight(cellWidth) : viewMode === 'list' ? LIST_ROW_HEIGHT : TABLE_ROW_HEIGHT
  const rowCount = viewMode === 'list' ? 0 : viewMode === 'grid' ? Math.ceil(processedItems.length / columns) : processedItems.length
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

          <div className="dsh-ig-gallery-tab-toggle" role="tablist">
            <button type="button" role="tab" aria-selected={activeTab === 'gallery'} className={`dsh-ig-gallery-tab-btn ${activeTab === 'gallery' ? 'is-active' : ''}`} onClick={() => setActiveTab('gallery')}>🖼️ {t('galleryTitle')}</button>
            <button type="button" role="tab" aria-selected={activeTab === 'inspiration'} className={`dsh-ig-gallery-tab-btn ${activeTab === 'inspiration' ? 'is-active' : ''}`} onClick={() => setActiveTab('inspiration')}>✦ {t('inspiration')}</button>
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

        {activeTab === 'gallery' ? (
          <div className="dsh-ig-gallery-management-row">
            <button type="button" className={`dsh-ig-gallery-manage-btn ${favoritesOnly ? 'is-active' : ''}`} onClick={() => setFavoritesOnly((value) => !value)}>★ {t('favoritesOnly')}</button>
            <label className="dsh-ig-gallery-workspace-toggle" title={activeWorkspace === null ? t('workspaceUnavailable') : undefined}><input type="checkbox" disabled={activeWorkspace === null} checked={activeWorkspace === null ? false : workspaceOnly} onChange={(event) => setWorkspaceOnly(event.target.checked)} /><span>{activeWorkspace === null ? t('workspaceUnavailable') : workspaceOnly ? t('workspaceOnly') : t('workspaceAll')}</span></label>
            <button type="button" className={`dsh-ig-gallery-manage-btn ${manageMode ? 'is-active' : ''}`} onClick={() => { setManageMode((value) => !value); setSelectedIds(new Set()) }}>{manageMode ? t('exitManage') : t('manage')}</button>
            {manageMode ? <>
              <button type="button" className="dsh-ig-gallery-manage-btn" onClick={selectAllVisible}>{t('selectAll')}</button>
              <button type="button" className="dsh-ig-gallery-manage-btn" onClick={() => setSelectedIds(new Set())}>{t('clearSelect')}</button>
              <span className="dsh-ig-gallery-selected-count">{t('selectedCount', { count: String(selectedIds.size) })}</span>
              <label className="dsh-ig-gallery-workspace-toggle"><input type="checkbox" checked={deleteWorkspaceFiles} onChange={(event) => setDeleteWorkspaceFiles(event.target.checked)} /><span>{t('deleteWorkspaceFilesOpt')}</span></label>
              <button type="button" className="dsh-ig-gallery-manage-btn dsh-ig-gallery-manage-danger" disabled={selectedIds.size === 0 || generating} onClick={() => { void deleteSelected() }}>{t('batchDelete')}</button>
            </> : null}
          </div>
        ) : null}

        {/* Search + ratio + sort controls */}
        {activeTab === 'gallery' ? <div className="dsh-ig-gallery-page-tools">
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
        </div> : null}
      </header>

      {/* Content */}
      <div className="dsh-ig-gallery-page-body" ref={bodyRef}>
        {activeTab === 'inspiration' ? (
          <InspirationView
            locale={locale}
            defaultEngine={selectedEngine === 'gemini' ? 'gemini' : 'gpt'}
            busy={generating}
            onUsePrompt={async (prompt, engine) => {
              await generateThroughCpa(prompt, engine)
              showToast(t('regenerateSuccess'))
            }}
          />
        ) : items.length === 0 ? (
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
            {(visibleGridRows ?? []).map((rowItems, ri) => {
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
                  {(rowItems ?? []).map((item) => (
                    <GalleryGridCard
                      key={item.id}
                      item={item}
                      lang={lang}
                      t={t}
                      onPreview={openPreview}
                       manage={manageMode}
                       selected={selectedIds.has(item.id)}
                       onSelect={toggleSelected}
                       onToggleFavorite={toggleFavorite}
                       onRegenerate={regenerateItem}
                      onToast={showToast}
                    />
                  ))}
                </div>
              )
            })}
          </div>
        ) : viewMode === 'list' ? (
          <div className="dsh-ig-gallery-list-flow">
            {(processedItems ?? []).map((item) => (
              <GalleryListItem
                key={item.id}
                item={item}
                lang={lang}
                t={t}
                onPreview={openPreview}
                manage={manageMode}
                selected={selectedIds.has(item.id)}
                onSelect={toggleSelected}
                onToggleFavorite={toggleFavorite}
                onRegenerate={regenerateItem}
                onToast={showToast}
              />
            ))}
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
                {(visibleItems ?? []).map((item) => (
                  <GalleryTableRow
                    key={item.id}
                    item={item}
                    lang={lang}
                    t={t}
                    onPreview={openPreview}
                       manage={manageMode}
                       selected={selectedIds.has(item.id)}
                       onSelect={toggleSelected}
                       onToggleFavorite={toggleFavorite}
                       onRegenerate={regenerateItem}
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
          <span className="dsh-ig-tag" title={item.normalizationError ?? item.saveError}>{galleryEngineLabel(item.engine)}</span>
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
          <button type="button" className="dsh-ig-lightbox-btn dsh-ig-lightbox-btn-danger" title={t('delete')} onClick={() => { void handleDelete(item, t, onToast).then((deleted) => { if (deleted) onClose() }) }}>
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
  manage: boolean
  selected: boolean
  onSelect: (item: GalleryItem) => void
  onToggleFavorite: (item: GalleryItem) => void | Promise<void>
  onRegenerate: (item: GalleryItem) => void | Promise<void>
}

/** Grid card: visual-first thumbnail with floating quick actions. */
const GalleryGridCard: FC<ViewItemProps> = ({ item, t, onPreview, onToast, manage = false, selected = false, onSelect, onToggleFavorite, onRegenerate }) => {
  const { url, loading, error } = useGalleryImage(item.attachment, 'thumb')

  return (
    <div
      className="dsh-ig-gallery-card"
      onClick={() => {
        if (manage) onSelect?.(item)
        else if (url) onPreview(item)
      }}
    >
      <div className="dsh-ig-gallery-card-media">
        {manage ? <input type="checkbox" className="dsh-ig-gallery-select-checkbox" checked={selected} onChange={() => onSelect?.(item)} onClick={(event) => event.stopPropagation()} aria-label={item.prompt} /> : null}
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
          <button type="button" className="dsh-ig-tool-btn" title={t('favoritesOnly')} aria-pressed={item.isFavorite === true} onClick={(e) => { e.stopPropagation(); void onToggleFavorite?.(item) }}>{item.isFavorite === true ? '★' : '☆'}</button>
           <button type="button" className="dsh-ig-tool-btn" title={t('regenerate')} onClick={(e) => { e.stopPropagation(); void onRegenerate?.(item) }}>↻</button>
           <button type="button" className="dsh-ig-tool-btn dsh-ig-tool-btn-danger" title={t('delete')} onClick={(e) => { e.stopPropagation(); void handleDelete(item, t, onToast) }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
          </button>
        </div>
      </div>

      <div className="dsh-ig-gallery-card-meta">
        <div className="dsh-ig-gallery-card-header">
          <span className="dsh-ig-tag" title={item.normalizationError ?? item.saveError}>{galleryEngineLabel(item.engine)}</span>
        </div>
        <p className="dsh-ig-gallery-card-prompt" title={item.prompt}>{item.prompt}</p>
      </div>
    </div>
  )
}

/** List row: horizontal thumbnail + full prompt + metadata + action bar. */
const GalleryListItem: FC<ViewItemProps> = ({ item, lang, t, onPreview, onToast, manage = false, selected = false, onSelect, onToggleFavorite, onRegenerate }) => {
  const { url, loading, error } = useGalleryImage(item.attachment, 'thumb')

  return (
    <div
      className="dsh-ig-gallery-list-item"
      onClick={() => {
        if (manage) onSelect?.(item)
        else if (url) onPreview(item)
      }}
    >
      <div className="dsh-ig-gallery-list-thumb">
        {manage ? <input type="checkbox" className="dsh-ig-gallery-select-checkbox" checked={selected} onChange={() => onSelect?.(item)} onClick={(event) => event.stopPropagation()} aria-label={item.prompt} /> : null}
        {loading && <div className="dsh-ig-gallery-card-loading">...</div>}
        {error && <div className="dsh-ig-gallery-card-error">⚠️</div>}
        {url && <img src={url} alt={item.prompt} loading="lazy" decoding="async" />}
      </div>

      <div className="dsh-ig-gallery-list-main">
        <div className="dsh-ig-gallery-list-tags">
          <span className="dsh-ig-tag" title={item.normalizationError ?? item.saveError}>{galleryEngineLabel(item.engine)}</span>
        </div>
        <p className="dsh-ig-gallery-list-prompt" title={item.prompt}>{item.prompt}</p>
        <div className="dsh-ig-gallery-list-meta">
          <span title={t('colResolution')}>{formatResolution(item)}</span>
          <span title={t('colSize')}>{formatBytes(item.attachment?.bytes)}</span>
          <span title={t('colTime')}>{formatDate(item.createdAt, lang)}</span>
        </div>
      </div>

      <GalleryActionsBar item={item} t={t} onToast={onToast} onToggleFavorite={onToggleFavorite} onRegenerate={onRegenerate} />
    </div>
  )
}

const GalleryTableRow: FC<ViewItemProps> = ({ item, lang, t, onPreview, onToast, manage = false, selected = false, onSelect, onToggleFavorite, onRegenerate }) => {
  const { url, loading, error } = useGalleryImage(item.attachment, 'thumb')

  return (
    <tr
      className="dsh-ig-gallery-table-row"
      onClick={() => {
        if (manage) onSelect?.(item)
        else if (url) onPreview(item)
      }}
    >
      <td className="dsh-ig-table-cell-thumb">
        {manage ? <input type="checkbox" className="dsh-ig-gallery-select-checkbox" checked={selected} onChange={() => onSelect?.(item)} onClick={(event) => event.stopPropagation()} aria-label={item.prompt} /> : null}
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
          <span className="dsh-ig-tag" title={item.normalizationError ?? item.saveError}>{galleryEngineLabel(item.engine)}</span>
        </div>
      </td>
      <td>{formatResolution(item) || '—'}</td>
      <td>{formatBytes(item.attachment?.bytes)}</td>
      <td>{formatDate(item.createdAt, lang)}</td>
      <td onClick={(e) => e.stopPropagation()}>
        <GalleryActionsBar item={item} t={t} onToast={onToast} onToggleFavorite={onToggleFavorite} onRegenerate={onRegenerate} />
      </td>
    </tr>
  )
}

/** Inline icon action bar shared by list and table views. */
const GalleryActionsBar: FC<{
  item: GalleryItem
  t: Translate
  onToast: (msg: string) => void
  onToggleFavorite: (item: GalleryItem) => void | Promise<void>
  onRegenerate: (item: GalleryItem) => void | Promise<void>
}> = ({ item, t, onToast, onToggleFavorite, onRegenerate }) => {
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
      <button type="button" className="dsh-ig-action-btn" title={t('favoritesOnly')} aria-pressed={item.isFavorite === true} onClick={(e) => { e.stopPropagation(); void onToggleFavorite?.(item) }}>{item.isFavorite === true ? '★' : '☆'}</button>
      <button type="button" className="dsh-ig-action-btn" title={t('regenerate')} onClick={(e) => { e.stopPropagation(); void onRegenerate?.(item) }}>↻</button>
      <button type="button" className="dsh-ig-action-btn dsh-ig-action-btn-danger" title={t('delete')} onClick={(e) => { e.stopPropagation(); void handleDelete(item, t, onToast) }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
      </button>
    </div>
  )
}

async function handleCopyPrompt(item: GalleryItem, t: Translate, onToast: (msg: string) => void): Promise<void> {
  try {
    await copyText(item.prompt)
    onToast(t('copiedPrompt'))
  } catch {
    onToast(t('copyFailed'))
  }
}

async function copyText(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value)
    return
  }
  const textarea = document.createElement('textarea')
  textarea.value = value
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  try {
    if (!document.execCommand('copy')) throw new Error('copy-failed')
  } finally {
    document.body.removeChild(textarea)
  }
}

async function handleCopyImage(blob: Blob, t: Translate, onToast: (msg: string) => void): Promise<void> {
  const ok = await copyImageBlob(blob)
  onToast(ok ? t('copiedImage') : t('copyFailed'))
}

async function handleDelete(item: GalleryItem, t: Translate, onToast: (msg: string) => void): Promise<boolean> {
  if (!window.confirm(t('confirmDelete'))) return false
  if (typeof item.savedTo === 'string' && item.savedTo.trim() !== '' && isCanonicalSavedToPath(item.savedTo) && window.confirm(t('confirmDeleteWorkspace'))) {
    try {
      const response = await fetch(DELETE_ROUTE, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ paths: [item.savedTo] }),
      })
      const payload = await response.json().catch(() => null) as { ok?: unknown; failedFiles?: unknown } | null
      if (!response.ok || payload?.ok !== true || (Array.isArray(payload.failedFiles) && payload.failedFiles.length > 0)) {
        onToast(t('deleteFailed'))
        return false
      }
    } catch {
      onToast(t('deleteFailed'))
      return false
    }
  }
  if (!(await deleteGalleryItem(item.id))) {
    onToast(t('deleteFailed'))
    return false
  }
  onToast(t('deleted'))
  return true
}

function isCanonicalSavedToPath(value: string): boolean {
  const normalized = value.replace(/\\/g, '/')
  if (!(normalized.startsWith('/') || /^[A-Za-z]:\//u.test(normalized))) return false
  return /^image-[0-9a-f]{64}\.(?:png|jpg|jpeg|webp|gif)$/iu.test(normalized.slice(normalized.lastIndexOf('/') + 1))
}

function handleDownload(item: GalleryItem, url: string): void {
  const extension = item.attachment.mediaType === 'image/jpeg' ? 'jpg' : item.attachment.mediaType.split('/')[1] ?? 'png'
  const a = document.createElement('a')
  a.href = url
  a.download = `dsh-${item.engine}-${item.id}.${extension}`
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

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

function recordArray(value: unknown, key: string): Record<string, unknown>[] {
  const root = record(value)
  if (!Array.isArray(root?.[key])) return []
  return root[key].filter((item): item is Record<string, unknown> => record(item) !== undefined)
}

export async function copyImageBlob(blob: Blob): Promise<boolean> {
  try {
    if (blob.type === 'image/png') {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      return true
    }
    const img = new Image()
    const url = URL.createObjectURL(blob)
    try {
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
      const pngBlob = await new Promise<Blob | null>((res) => {
        canvas.toBlob(res, 'image/png')
      })
      if (!pngBlob) throw new Error('Blob conversion failed')
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })])
      return true
    } finally {
      URL.revokeObjectURL(url)
    }
  } catch (_err) {
    return false
  }
}
