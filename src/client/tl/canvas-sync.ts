/**
 * Live canvas-state sync from one tldraw surface to the host mirror.
 *
 * The conversation agent runs in the host process and cannot see the browser
 * canvas, so this module is the canvas's voice: it watches the editor store,
 * summarizes the page (shape inventory + selection) and pushes a compact
 * snapshot to the canvas-state route. When the selection settles, it also
 * exports a fallback PNG screenshot (persistent images may come from a
 * different conversation), which the host
 * turns into a durable attachment (view_canvas / edit_image
 * source=canvas_selection read exactly that).
 *
 * Pushes are fire-and-forget: failures warn in the console and the next
 * change retries. Duplicate snapshots (e.g. camera pans that change nothing
 * in the summary) never hit the network.
 */
import type { Editor, TLShape } from 'tldraw'
import { CANVAS_MAX_NODES, CANVAS_MAX_PROMPT_CHARS, CANVAS_MAX_SELECTION_ITEMS, CANVAS_MAX_SELECTION_KINDS, CANVAS_STATE_ROUTE, type CanvasNodeKind, type CanvasNodeSummary } from '../../shared.js'

/** Debounce for ordinary document/session changes. */
const STATE_DEBOUNCE_MS = 600
/** Extra settle time before an expensive selection screenshot export. */
const SELECTION_EXPORT_DELAY_MS = 1200
/** Minimum spacing between two HTTP pushes. */
const MIN_PUSH_INTERVAL_MS = 400
const MAX_TEXT_CHARS = 96
/** Hard cap on the exported screenshot payload (base64 chars, ~5MB binary). */
const MAX_SCREENSHOT_DATAURL_CHARS = 7_000_000

/** Map a tldraw shape type onto the coarse model-facing node kind. */
function kindOf(shapeType: string): CanvasNodeKind {
  switch (shapeType) {
    case 'image': return 'image'
    case 'draw':
    case 'highlight': return 'draw'
    case 'text': return 'text'
    case 'note': return 'note'
    case 'geo': return 'geo'
    case 'arrow':
    case 'line': return 'arrow'
    case 'frame': return 'frame'
    default: return 'other'
  }
}

/** Flatten a ProseMirror-style rich text node into a plain text preview. */
function richTextPreview(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (value === null || typeof value !== 'object') return undefined
  const parts: string[] = []
  const visit = (node: unknown): void => {
    if (node === null || typeof node !== 'object') return
    const record = node as Record<string, unknown>
    if (typeof record.text === 'string') parts.push(record.text)
    if (Array.isArray(record.content)) for (const child of record.content) visit(child)
  }
  visit(value)
  return parts.length === 0 ? undefined : parts.join(' ')
}

function previewOf(text: string | undefined): string | undefined {
  if (text === undefined) return undefined
  const collapsed = text.replace(/\s+/g, ' ').trim()
  return collapsed.length === 0 ? undefined : collapsed.slice(0, MAX_TEXT_CHARS)
}

/**
 * Summarize one shape for the model. Used both for the page inventory and for
 * the selection identity list, so a selected node reads exactly like its
 * canvas node twin (same name, attachment id, dimensions).
 */
function describeShape(editor: Editor, shape: TLShape): CanvasNodeSummary {
  const node: CanvasNodeSummary = { kind: kindOf(shape.type) }
  if (shape.type === 'image') {
    const meta = shape.meta as { galleryId?: unknown; attachmentId?: unknown; name?: unknown; prompt?: unknown; provider?: unknown; model?: unknown } | undefined
    const galleryId = meta?.galleryId
    if (typeof galleryId === 'string' && galleryId.length > 0) {
      node.galleryId = galleryId
    }
    if (typeof meta?.attachmentId === 'string' && meta.attachmentId.length > 0) node.attachmentId = meta.attachmentId
    // Generation provenance written at landing time: lets the model reproduce
    // or precisely vary this image instead of guessing from pixels. Prompt is
    // truncated at landing; slice again defensively so a stale untruncated
    // shape (hot reload during dev) cannot bloat the digest.
    if (typeof meta?.prompt === 'string' && meta.prompt.trim().length > 0) {
      node.prompt = meta.prompt.replace(/\s+/g, ' ').trim().slice(0, CANVAS_MAX_PROMPT_CHARS)
    }
    if (typeof meta?.provider === 'string' && meta.provider.length > 0) node.provider = meta.provider
    if (typeof meta?.model === 'string' && meta.model.length > 0) node.model = meta.model
    const asset = shape.props.assetId === null ? undefined : editor.getAsset(shape.props.assetId)
    const assetName = typeof meta?.name === 'string' && meta.name.length > 0
      ? meta.name : asset !== undefined && asset.type === 'image' ? asset.props.name : undefined
    if (typeof assetName === 'string' && assetName.length > 0) node.name = assetName.slice(0, 128)
    if (asset !== undefined && asset.type === 'image') {
      node.width = Math.round(asset.props.w)
      node.height = Math.round(asset.props.h)
    } else {
      node.width = Math.round(shape.props.w)
      node.height = Math.round(shape.props.h)
    }
  } else if (shape.type === 'text' || shape.type === 'note') {
    const preview = previewOf(richTextPreview(shape.props.richText))
    if (preview !== undefined) node.text = preview
    // TLTextShapeProps has no `h`: tldraw auto-sizes text height from content.
    if (shape.type === 'text') node.width = Math.round(shape.props.w)
  } else if (shape.type === 'geo') {
    node.name = String(shape.props.geo)
    const preview = previewOf(richTextPreview(shape.props.richText))
    if (preview !== undefined) node.text = preview
    node.width = Math.round(shape.props.w)
    node.height = Math.round(shape.props.h)
  }
  return node
}

interface CanvasSummary {
  nodeCount: number
  nodes: CanvasNodeSummary[]
  selectionCount: number
  selectionKinds: CanvasNodeKind[]
  /** Identity list of the selected shapes, capped at the selection-items limit. */
  selectionItems: CanvasNodeSummary[]
  /** Stable key over the summarized state; unchanged key = no HTTP push. */
  stateKey: string
  /** Stable key over just the selection; a change re-arms the screenshot export. */
  selectionKey: string
}

function summarize(editor: Editor): CanvasSummary {
  const shapes = editor.getCurrentPageShapes()
  const nodes: CanvasNodeSummary[] = []
  for (const shape of shapes.slice(0, CANVAS_MAX_NODES)) {
    nodes.push(describeShape(editor, shape))
  }

  const selected = editor.getSelectedShapes()
  const selectionKinds = [...new Set(selected.map(shape => kindOf(shape.type)))].slice(0, CANVAS_MAX_SELECTION_KINDS)
  const selectionItems = selected.slice(0, CANVAS_MAX_SELECTION_ITEMS).map(shape => describeShape(editor, shape))
  const selectionKey = selectionKeyOf(editor)
  return {
    nodeCount: shapes.length,
    nodes,
    selectionCount: selected.length,
    selectionKinds,
    selectionItems,
    // selectionItems must join the key: a selected shape beyond the
    // CANVAS_MAX_NODES truncation leaves no trace in `nodes`, so editing its
    // content would otherwise change nothing here and the push never fires.
    stateKey: JSON.stringify([shapes.length, nodes, selectionKinds, selected.length, selectionItems, selectionKey]),
    selectionKey,
  }
}

/**
 * Selection identity key: sorted shape ids joined with '|', 'none' when the
 * selection is empty. Both the hot listener path and `summarize()` call this
 * one function, so the two can never disagree on "did the selection change".
 */
function selectionKeyOf(editor: Editor): string {
  const ids = editor.getSelectedShapeIds().map(String).sort().join('|')
  return ids.length === 0 ? 'none' : ids
}

/**
 * Start mirroring one editor into the host canvas-state route.
 * Returns a disposer that stops listening and marks the instance offline.
 */
export function startCanvasSync(editor: Editor): () => void {
  const clientInstance = String(editor.id)
  let disposed = false
  let stateTimer: ReturnType<typeof setTimeout> | undefined
  let exportTimer: ReturnType<typeof setTimeout> | undefined
  let lastPushKey = ''
  let lastSelectionKey = 'init'
  let lastPostAt = 0
  let inFlight: AbortController | undefined

  const stopListening = editor.store.listen(() => {
    if (disposed) return
    // Hot path: store changes fire at pointer-move frequency while drawing.
    // Only compare the selection ids here (O(selected shapes)); the expensive
    // full summarize() runs inside the debounced flush instead, so a burst of
    // drawing events costs a few string comparisons, not a page walk.
    const selectionKey = selectionKeyOf(editor)
    if (selectionKey !== lastSelectionKey) {
      // Selection changed: re-arm the settled-screenshot export timer.
      lastSelectionKey = selectionKey
      if (exportTimer !== undefined) clearTimeout(exportTimer)
      exportTimer = setTimeout(() => {
        exportTimer = undefined
        void flush(true)
      }, SELECTION_EXPORT_DELAY_MS)
    }
    if (stateTimer === undefined) {
      stateTimer = setTimeout(() => {
        stateTimer = undefined
        void flush(false)
      }, STATE_DEBOUNCE_MS)
    }
  }, { source: 'all', scope: 'all' })

  async function flush(withScreenshot: boolean): Promise<void> {
    if (disposed) return
    const summary = summarize(editor)
    if (!withScreenshot && summary.stateKey === lastPushKey) return
    const elapsed = Date.now() - lastPostAt
    if (elapsed < MIN_PUSH_INTERVAL_MS) {
      if (stateTimer !== undefined) clearTimeout(stateTimer)
      stateTimer = setTimeout(() => {
        stateTimer = undefined
        void flush(withScreenshot)
      }, MIN_PUSH_INTERVAL_MS - elapsed)
      return
    }

    let selectionImage: string | undefined
    // Persistent images may belong to a different conversation. Keep a
    // screenshot fallback; the host still prefers available original images.
    if (withScreenshot && summary.selectionCount > 0) {
      try {
        const selectedBefore = editor.getSelectedShapes()
        const { url } = await editor.toImageDataUrl(selectedBefore, { background: true, padding: 16, scale: 1, pixelRatio: 2 })
        if (disposed) return
        // Export is async: if the selection moved while it ran, this image no
        // longer matches what the user has selected — discard it and let the
        // listener's re-armed export timer produce a fresh one.
        const selectedAfter = editor.getSelectedShapes()
        const idsBefore = new Set(selectedBefore.map(shape => String(shape.id)))
        const unchanged = selectedBefore.length === selectedAfter.length
          && selectedAfter.every(shape => idsBefore.has(String(shape.id)))
        if (!unchanged) return
        if (url.length > MAX_SCREENSHOT_DATAURL_CHARS) {
          console.warn('[dsh-image-gen] canvas selection screenshot skipped: too large')
        } else {
          selectionImage = url
        }
      } catch (error) {
        console.warn('[dsh-image-gen] canvas selection screenshot failed:', error)
      }
    }

    const payload: Record<string, unknown> = {
      clientInstance,
      connected: true,
      nodeCount: summary.nodeCount,
      nodes: summary.nodes,
      selection: { count: summary.selectionCount, kinds: summary.selectionKinds, items: summary.selectionItems },
      updatedAt: Date.now(),
    }
    if (selectionImage !== undefined) payload.selectionImage = selectionImage

    lastPushKey = summary.stateKey
    lastPostAt = Date.now()
    const controller = new AbortController()
    inFlight = controller
    try {
      await fetch(CANVAS_STATE_ROUTE, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      })
    } catch (error) {
      if (!disposed) console.warn('[dsh-image-gen] canvas state push failed:', error)
      // Let the next change retry: forget the key so the push is not skipped.
      lastPushKey = ''
    }
  }

  // Initial snapshot once the editor settles.
  stateTimer = setTimeout(() => {
    stateTimer = undefined
    void flush(false)
  }, STATE_DEBOUNCE_MS)

  // A persisted selection may already exist before our store listener starts.
  if (editor.getSelectedShapeIds().length > 0) {
    exportTimer = setTimeout(() => {
      exportTimer = undefined
      void flush(true)
    }, SELECTION_EXPORT_DELAY_MS)
  }

  return () => {
    if (disposed) return
    disposed = true
    if (stateTimer !== undefined) clearTimeout(stateTimer)
    if (exportTimer !== undefined) clearTimeout(exportTimer)
    stopListening()
    inFlight?.abort()
    // Best-effort offline marker; keepalive lets it survive the unload path.
    void fetch(CANVAS_STATE_ROUTE, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({ clientInstance, connected: false, nodeCount: 0, updatedAt: Date.now() }),
    }).catch(() => {})
  }
}
