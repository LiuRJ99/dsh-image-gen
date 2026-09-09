/**
 * Canvas workspace tab: a React Flow node graph where text/image nodes feed
 * config nodes and generation results land back on the canvas, chaining the
 * conversation's edit history into a visual exploration space.
 */
import {
  Background,
  BackgroundVariant,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type NodeTypes,
} from '@xyflow/react'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FC,
} from 'react'
import type { StudioConfigResponse, StudioGenerateResponse, StudioProviderProfile } from '../../shared.js'
import { STUDIO_ROUTE } from '../../shared.js'
import { getGalleryItems, saveGalleryItem } from '../gallery-store.js'
import type { LocaleService } from '../gallery-view.js'
import { CanvasBridgeContext, type CanvasBridge } from './canvas-bridge.js'
import {
  buildGenerationRequest,
  buildImportGraph,
  imageNodeIdOf,
  isLegalConnection,
  mergeIntoCanvas,
  newConfigNode,
  newImageNode,
  newTextNode,
  nodeKindOf,
  outputPosition,
  resolveConfigInputs,
  toDocument,
  type CanvasNode,
  type ConfigNode,
  type ImportRecord,
} from './canvas-model.js'
import { canvasNodeTypes } from './canvas-nodes.js'
import {
  drainPendingCanvasImports,
  loadCanvasDocument,
  saveCanvasDocument,
  subscribeCanvas,
} from './canvas-store.js'

export interface CanvasViewTabProps {
  locale?: LocaleService
  sessionId?: string
  useSessions?: (selector: (state: any) => any) => any
}

const VIEW_DICT = {
  zh: {
    addText: '文本',
    addImage: '图片',
    addConfig: '配置',
    importSession: '导入本会话',
    undo: '撤销',
    redo: '重做',
    fit: '适应视图',
    deleteSelected: '删除选中',
    deleteSelectedNone: '请先选中要删除的节点',
    clear: '清空画布',
    clearConfirm: '确定清空画布上的全部节点？',
    saved: '已保存',
    saving: '保存中…',
    emptyTitle: '画布'
    ,
    emptyHint: '空空如也。添加文本写提示词、拖线到配置节点发起生成，或一键导入本会话的编辑链。对话中生成的图也可随时「加入画布」。',
    importNone: '当前会话暂无可导入的图片',
    imported: '已导入 {n} 张图片',
    addedToCanvas: '已加入画布',
    generateFailed: '生成失败',
  },
  en: {
    addText: 'Text',
    addImage: 'Image',
    addConfig: 'Config',
    importSession: 'Import session',
    undo: 'Undo',
    redo: 'Redo',
    fit: 'Fit view',
    deleteSelected: 'Delete selected',
    deleteSelectedNone: 'Select nodes to delete first',
    clear: 'Clear canvas',
    clearConfirm: 'Clear every node on the canvas?',
    saved: 'Saved',
    saving: 'Saving…',
    emptyTitle: 'Canvas',
    emptyHint: 'Nothing here yet. Add a text node for prompts, drag edges into a config node to generate, or import this session\'s edit chain. Images from the conversation can be sent to the canvas anytime.',
    importNone: 'No importable images in this session yet',
    imported: 'Imported {n} images',
    addedToCanvas: 'Added to canvas',
    generateFailed: 'Generation failed',
  },
} as const

export const CanvasViewTab: FC<CanvasViewTabProps> = (props) => (
  <ReactFlowProvider>
    <CanvasWorkspace {...props} />
  </ReactFlowProvider>
)

interface HistorySnapshot {
  nodes: CanvasNode[]
  edges: Edge[]
}

const MAX_HISTORY = 60

/** Locale subscription mirroring the settings card's language hook. */
function usePluginLanguage(locale: LocaleService | undefined): 'en' | 'zh' {
  const [lang, setLang] = useState<'en' | 'zh'>(() => locale?.getSnapshot?.()?.active?.startsWith('en') ? 'en' : 'zh')
  useEffect(() => locale?.subscribe?.(() => {
    setLang(locale?.getSnapshot?.()?.active?.startsWith('en') ? 'en' : 'zh')
  }), [locale])
  return lang
}

function CanvasWorkspace({ locale, sessionId, useSessions }: CanvasViewTabProps) {
  const lang = usePluginLanguage(locale)
  const dict = VIEW_DICT[lang]
  const [nodes, setNodes, onNodesChange] = useNodesState<CanvasNode>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [profiles, setProfiles] = useState<readonly StudioProviderProfile[]>([])
  const [ready, setReady] = useState(false)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [toast, setToast] = useState<string>()
  const instance = useReactFlow()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout>>()
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>()
  const pastRef = useRef<HistorySnapshot[]>([])
  const futureRef = useRef<HistorySnapshot[]>([])

  // Mirrored state for stable callbacks.
  const nodesRef = useRef(nodes)
  const edgesRef = useRef(edges)
  const profilesRef = useRef(profiles)
  const sessionIdRef = useRef(sessionId)
  const langRef = useRef(lang)
  const dictRef = useRef(dict)
  nodesRef.current = nodes
  edgesRef.current = edges
  profilesRef.current = profiles
  sessionIdRef.current = sessionId
  langRef.current = lang
  dictRef.current = dict

  const showToast = useCallback((text: string) => {
    setToast(text)
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    toastTimerRef.current = setTimeout(() => setToast(undefined), 2600)
  }, [])

  const pushHistory = useCallback(() => {
    pastRef.current = [...pastRef.current.slice(-(MAX_HISTORY - 1)), { nodes: nodesRef.current, edges: edgesRef.current }]
    futureRef.current = []
  }, [])

  const undo = useCallback(() => {
    const previous = pastRef.current.pop()
    if (previous === undefined) return
    futureRef.current = [...futureRef.current, { nodes: nodesRef.current, edges: edgesRef.current }]
    setNodes(previous.nodes)
    setEdges(previous.edges)
  }, [setNodes, setEdges])

  const redo = useCallback(() => {
    const next = futureRef.current.pop()
    if (next === undefined) return
    pastRef.current = [...pastRef.current, { nodes: nodesRef.current, edges: edgesRef.current }]
    setNodes(next.nodes)
    setEdges(next.edges)
  }, [setNodes, setEdges])

  const updateNodeData = useCallback((nodeId: string, patch: Record<string, unknown>) => {
    setNodes(current => current.map(node =>
      node.id === nodeId ? { ...node, data: { ...node.data, ...patch } } : node))
  }, [setNodes])

  const deleteNode = useCallback((nodeId: string) => {
    pushHistory()
    setNodes(current => current.filter(node => node.id !== nodeId))
    setEdges(current => current.filter(edge => edge.source !== nodeId && edge.target !== nodeId))
  }, [pushHistory, setNodes, setEdges])

  const deleteSelected = useCallback(() => {
    const selected = nodesRef.current.filter(node => node.selected)
    if (selected.length === 0) return
    const ids = new Set(selected.map(node => node.id))
    pushHistory()
    setNodes(current => current.filter(node => !ids.has(node.id)))
    setEdges(current => current.filter(edge => !ids.has(edge.source) && !ids.has(edge.target)))
  }, [pushHistory, setNodes, setEdges])

  const requestGenerate = useCallback(async (configNodeId: string) => {
    const config = nodesRef.current.find(node => node.id === configNodeId)
    if (config === undefined || nodeKindOf(config) !== 'config') return
    const profile = profilesRef.current.find(candidate => candidate.provider === config.data.provider)
    if (profile?.configured === false) {
      updateNodeData(configNodeId, { error: langRef.current === 'en' ? 'Provider key not configured' : '该 Provider 未配置 Key' })
      return
    }
    const inputs = resolveConfigInputs(nodesRef.current, edgesRef.current, configNodeId)
    const request = buildGenerationRequest(config as ConfigNode, inputs)
    if (request === undefined) {
      updateNodeData(configNodeId, { error: langRef.current === 'en' ? 'Enter a prompt first' : '请先输入提示词' })
      return
    }
    updateNodeData(configNodeId, { generating: true, error: undefined })
    try {
      const response = await fetch(STUDIO_ROUTE, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(request),
      })
      const payload = await response.json().catch(() => null) as StudioGenerateResponse | { error?: string } | null
      if (!response.ok || payload === null || !('attachment' in payload)) {
        throw new Error(payload && 'error' in payload && typeof payload.error === 'string'
          ? payload.error
          : dictRef.current.generateFailed)
      }
      const outputs = payload.items !== undefined && payload.items.length > 0 ? payload.items : [payload]
      const existingOutputCount = edgesRef.current.filter(edge => edge.source === configNodeId).length
      const sourceIds = inputs.referenceAttachments.map(attachment => attachment.attachmentId)
      for (const [index, output] of outputs.entries()) {
        const imageNodeId = imageNodeIdOf(output.attachment.attachmentId)
        if (!nodesRef.current.some(node => node.id === imageNodeId)) {
          setNodes(current => [...current, newImageNode({
            attachment: output.attachment,
            prompt: payload.prompt,
            x: outputPosition(config, existingOutputCount, index).x,
            y: outputPosition(config, existingOutputCount, index).y,
          }, imageNodeId)])
        }
        setEdges(current => current.some(edge => edge.source === configNodeId && edge.target === imageNodeId)
          ? current
          : [...current, { id: `e-${configNodeId}-${imageNodeId}`, source: configNodeId, target: imageNodeId }])
        // Auto-collect into the gallery (with chain provenance) so future session imports rebuild this chain.
        void saveGalleryItem({
          id: output.attachment.attachmentId,
          attachment: output.attachment,
          prompt: payload.prompt,
          provider: payload.provider,
          model: payload.model,
          output: output.output,
          ...(output.savedTo !== undefined ? { savedTo: output.savedTo } : {}),
          ...(sourceIds.length > 0 ? { sourceAttachmentIds: sourceIds } : {}),
          ...(sessionIdRef.current !== undefined ? { sessionId: sessionIdRef.current } : {}),
        })
      }
    } catch (error) {
      updateNodeData(configNodeId, {
        error: error instanceof Error ? error.message : dictRef.current.generateFailed,
      })
    } finally {
      updateNodeData(configNodeId, { generating: false })
    }
  }, [setNodes, setEdges, updateNodeData])

  const bridge = useMemo<CanvasBridge>(() => ({
    updateNodeData,
    requestGenerate: (nodeId: string) => { void requestGenerate(nodeId) },
    deleteNode,
    profiles,
    lang,
  }), [updateNodeData, requestGenerate, deleteNode, profiles, lang])

  // Provider profiles from the studio config endpoint.
  useEffect(() => {
    let cancelled = false
    fetch(STUDIO_ROUTE)
      .then(res => (res.ok ? res.json() : null))
      .then((data: StudioConfigResponse | null) => {
        if (cancelled || !data || !Array.isArray(data.providers)) return
        setProfiles(data.providers)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  // Load the persisted document once.
  useEffect(() => {
    let cancelled = false
    void loadCanvasDocument().then(doc => {
      if (cancelled || doc === undefined) return
      const known = new Set(['image', 'text', 'config'])
      const restored = (doc.nodes as CanvasNode[]).filter(node => known.has(String(node.type)))
      setNodes(restored)
      setEdges((doc.edges as Edge[]).filter(edge =>
        restored.some(node => node.id === edge.source) && restored.some(node => node.id === edge.target)))
      if (doc.viewport !== undefined) instance.setViewport(doc.viewport)
      if (restored.length > 0) instance.fitView({ padding: 0.2, maxZoom: 1.2 })
    })
    return () => { cancelled = true }
  }, [setNodes, setEdges, instance])

  // Persist changes (debounced); skip the initial mount before load completes.
  useEffect(() => {
    if (!ready) {
      if (nodes.length > 0 || edges.length > 0) setReady(true)
      return
    }
    setSaveState('saving')
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      void saveCanvasDocument(toDocument(nodes, edges, instance.getViewport())).then(() => setSaveState('saved'))
    }, 1200)
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }
  }, [nodes, edges, ready, instance])

  const mergeGraph = useCallback((records: readonly ImportRecord[], announce: boolean) => {
    const graph = buildImportGraph(records)
    if (graph.nodes.length === 0) return 0
    pushHistory()
    const wasEmpty = nodesRef.current.length === 0
    const merged = mergeIntoCanvas(
      { nodes: nodesRef.current, edges: edgesRef.current },
      graph,
      wasEmpty ? { x: 0, y: 0 } : { x: 40, y: 40 },
    )
    setNodes(merged.nodes)
    setEdges(merged.edges)
    if (wasEmpty) instance.fitView({ padding: 0.25, maxZoom: 1 })
    if (announce) showToast(dictRef.current.imported.replace('{n}', String(graph.nodes.length)))
    return graph.nodes.length
  }, [pushHistory, setNodes, setEdges, instance, showToast])

  // Drain the cross-view pending imports (mount + live subscription).
  useEffect(() => {
    let cancelled = false
    const drain = () => {
      void drainPendingCanvasImports().then(records => {
        if (cancelled || records.length === 0) return
        mergeGraph(records.map(record => ({
          attachmentId: record.id,
          attachment: record.attachment,
          ...(record.prompt !== undefined ? { prompt: record.prompt } : {}),
          ...(record.provider !== undefined ? { provider: record.provider } : {}),
          ...(record.model !== undefined ? { model: record.model } : {}),
          createdAt: record.createdAt,
          ...(Array.isArray(record.sourceAttachmentIds) ? { sourceAttachmentIds: record.sourceAttachmentIds } : {}),
        })), true)
      })
    }
    drain()
    const unsubscribe = subscribeCanvas(() => drain())
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [mergeGraph])

  const currentSessionId = sessionId ?? useSessions?.((s: any) => s?.current)

  const importSession = useCallback(() => {
    void getGalleryItems().then(items => {
      const sessionIdNow = sessionIdRef.current
      const scoped = sessionIdNow !== undefined
        ? items.filter(item => item.sessionId === sessionIdNow)
        : items
      const records: ImportRecord[] = scoped.map(item => ({
        attachmentId: item.attachment.attachmentId,
        attachment: item.attachment,
        prompt: item.prompt,
        provider: item.provider,
        model: item.model,
        createdAt: item.createdAt,
        ...(Array.isArray(item.sourceAttachmentIds) ? { sourceAttachmentIds: item.sourceAttachmentIds } : {}),
      }))
      if (mergeGraph(records, false) === 0) {
        showToast(dictRef.current.importNone)
      } else {
        showToast(dictRef.current.imported.replace('{n}', String(records.length)))
      }
    }).catch(() => showToast(dictRef.current.importNone))
  }, [mergeGraph, showToast])

  const addNodeAtCenter = useCallback((node: CanvasNode) => {
    pushHistory()
    const position = instance.screenToFlowPosition({ x: window.innerWidth / 2, y: 260 })
    setNodes(current => [...current, { ...node, position }])
  }, [pushHistory, setNodes, instance])

  const addConfigAtCenter = useCallback(() => {
    addNodeAtCenter(newConfigNode(profilesRef.current[0], 0, 0))
  }, [addNodeAtCenter])

  const onConnect = useCallback((connection: Connection) => {
    const source = nodesRef.current.find(node => node.id === connection.source)
    const target = nodesRef.current.find(node => node.id === connection.target)
    if (!isLegalConnection(source, target)) return
    pushHistory()
    setEdges(current => addEdge(connection, current))
  }, [pushHistory, setEdges])

  const onUpload = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = String(reader.result ?? '')
      const comma = dataUrl.indexOf(',')
      if (comma < 0) return
      addNodeAtCenter(newImageNode({
        encoded: { mediaType: file.type || 'image/png', data: dataUrl.slice(comma + 1) },
        x: 0,
        y: 0,
      }))
    }
    reader.readAsDataURL(file)
  }

  const clearCanvas = () => {
    if (nodesRef.current.length === 0) return
    if (!window.confirm(dict.clearConfirm)) return
    pushHistory()
    setNodes([])
    setEdges([])
  }

  const nodeTypes: NodeTypes = canvasNodeTypes as unknown as NodeTypes

  return (
    <div className="dcv-root">
      <CanvasBridgeContext.Provider value={bridge}>
        <div className="dcv-toolbar">
          <div className="dcv-toolbar-group">
            <button type="button" className="dcv-btn" onClick={() => addNodeAtCenter(newTextNode('', 0, 0))}>+ {dict.addText}</button>
            <button type="button" className="dcv-btn" onClick={() => fileInputRef.current?.click()}>+ {dict.addImage}</button>
            <button type="button" className="dcv-btn dcv-btn-primary" onClick={addConfigAtCenter}>+ {dict.addConfig}</button>
          </div>
          <div className="dcv-toolbar-sep" />
          <div className="dcv-toolbar-group">
            <button type="button" className="dcv-btn" onClick={importSession}>{dict.importSession}</button>
          </div>
          <div className="dcv-toolbar-sep" />
          <div className="dcv-toolbar-group">
            <button type="button" className="dcv-btn" onClick={undo} disabled={pastRef.current.length === 0}>{dict.undo}</button>
            <button type="button" className="dcv-btn" onClick={redo} disabled={futureRef.current.length === 0}>{dict.redo}</button>
            <button type="button" className="dcv-btn" onClick={() => instance.fitView({ padding: 0.2, duration: 300 })}>{dict.fit}</button>
            <button type="button" className="dcv-btn" onClick={() => {
              if (nodesRef.current.some(node => node.selected)) deleteSelected()
              else showToast(dict.deleteSelectedNone)
            }}>{dict.deleteSelected}</button>
            <button type="button" className="dcv-btn" onClick={clearCanvas}>{dict.clear}</button>
          </div>
          <span className="dcv-save-state">{saveState === 'saving' ? dict.saving : saveState === 'saved' ? dict.saved : ''}</span>
        </div>
        <div className="dcv-canvas">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={(changes) => {
              if (changes.some(change => change.type === 'remove')) pushHistory()
              onNodesChange(changes)
            }}
            onEdgesChange={(changes) => {
              if (changes.some(change => change.type === 'remove')) pushHistory()
              onEdgesChange(changes)
            }}
            onConnect={onConnect}
            onNodeDragStart={() => pushHistory()}
            minZoom={0.05}
            maxZoom={5}
            deleteKeyCode={['Delete', 'Backspace']}
            className="dcv-flow"
          >
            <Background variant={BackgroundVariant.Dots} gap={22} size={1.4} color="rgba(128,140,152,.35)" />
            <MiniMap
              pannable
              zoomable
              nodeColor={node => {
                if (node.type === 'config') return '#4c78ff'
                if (node.type === 'text') return '#f59e0b'
                return '#10b981'
              }}
            />
          </ReactFlow>
          {nodes.length === 0
            ? (
              <div className="dcv-empty">
                <div className="dcv-empty-title">{dict.emptyTitle}</div>
                <p>{dict.emptyHint}</p>
              </div>
            )
            : null}
          {toast !== undefined ? <div className="dcv-toast">{toast}</div> : null}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          hidden
          onChange={event => {
            const file = event.target.files?.[0]
            if (file !== undefined) onUpload(file)
            event.target.value = ''
          }}
        />
      </CanvasBridgeContext.Provider>
    </div>
  )
}
