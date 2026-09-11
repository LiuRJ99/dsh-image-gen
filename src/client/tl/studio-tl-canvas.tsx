import { memo, useCallback, useEffect, useRef, type FC } from 'react'
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import {
  Tldraw,
  createShapeId,
  type Editor,
  type TLAssetId,
  type TLCreateShapePartial,
  type TLImageAsset,
  type TLImageShape,
} from 'tldraw'
import { blobToDataUrl } from '../browser-image-utils.js'
import { fetchAttachmentBlob } from '../image-cache.js'
import { startCanvasSync } from './canvas-sync.js'
import { getTlLandings, subscribeTlLandings, type TlLandingItem } from './tl-canvas-bridge.js'

/**
 * Infinite canvas surface for the Studio workbench, backed by tldraw.
 *
 * Generated images are pushed onto the tl-canvas-bridge landing bus (studio
 * form paths and chat tool cards land the same way) and become in-memory
 * image assets with data-URL sources. The bus broadcasts, so this surface
 * RECONCILES instead of draining: it lands the bus items its own page does
 * not carry yet. The conversation-view gallery tab and the right-sidebar
 * studio tab can both be mounted, and each mirrors the full session-scratch
 * set independently. The surface deliberately runs WITHOUT persistenceKey:
 * unsaved generations vanish on restart, matching the plugin's save-first
 * philosophy; data-URL assets therefore never touch disk. Shapes carry
 * `meta.galleryId` so re-landing the same generation is a no-op. One batch
 * = one createShapes transaction = one undo step.
 */

const MAX_DISPLAY_SIDE = 380
const GRID_GAP = 40
const GRID_COLS = 3

function tlAssetIdFor(galleryId: string): TLAssetId {
  return `asset:ig-${galleryId.replace(/[^A-Za-z0-9_-]/g, '_')}` as TLAssetId
}

function displaySizeOf(attachment: ImageAttachmentRef): { w: number; h: number } {
  const width = attachment.width > 0 ? attachment.width : 512
  const height = attachment.height > 0 ? attachment.height : 512
  const scale = MAX_DISPLAY_SIDE / Math.max(width, height)
  return { w: Math.round(width * scale), h: Math.round(height * scale) }
}

/** Gallery ids already on one page (image shapes' `meta.galleryId`). */
function landedIdsOf(editor: Editor): Set<string> {
  const landedIds = new Set<string>()
  for (const shape of editor.getCurrentPageShapes()) {
    if (shape.type !== 'image') continue
    const galleryId = (shape.meta as { galleryId?: unknown } | undefined)?.galleryId
    if (typeof galleryId === 'string') landedIds.add(galleryId)
  }
  return landedIds
}

async function landTlItems(editor: Editor, items: readonly TlLandingItem[], failedIds: Set<string>): Promise<void> {
  // Dedupe against shapes already on the page (meta.galleryId); under
  // broadcast semantics this also makes a re-entrant reconcile a no-op.
  const landedIds = landedIdsOf(editor)
  const pending = items.filter(item => !landedIds.has(item.galleryId))
  if (pending.length === 0) return

  const assets: TLImageAsset[] = []
  const landed: Array<{ galleryId: string; assetId: TLAssetId; w: number; h: number }> = []
  for (const item of pending) {
    const assetId = tlAssetIdFor(item.galleryId)
    if (editor.getAsset(assetId) === undefined) {
      try {
        const blob = await fetchAttachmentBlob(item.attachment)
        const src = await blobToDataUrl(blob)
        assets.push({
          id: assetId,
          typeName: 'asset',
          type: 'image',
          meta: {},
          props: {
            name: item.attachment.name ?? item.galleryId,
            src,
            w: item.attachment.width > 0 ? item.attachment.width : 512,
            h: item.attachment.height > 0 ? item.attachment.height : 512,
            mimeType: blob.type || item.attachment.mediaType,
            isAnimated: item.attachment.mediaType === 'image/gif',
            fileSize: item.attachment.bytes,
          },
        })
      } catch (error) {
        // Remember the miss: broadcast semantics never remove bus items, so
        // an unreadable attachment must not re-enter the reconcile loop.
        failedIds.add(item.galleryId)
        console.warn('[dsh-image-gen] canvas landing skipped (attachment unreadable):', item.galleryId, error)
        continue
      }
    }
    const size = displaySizeOf(item.attachment)
    landed.push({ galleryId: item.galleryId, assetId, w: size.w, h: size.h })
  }
  if (landed.length === 0) return
  if (assets.length > 0) editor.createAssets(assets)

  // Layout: rows of up to GRID_COLS images. The block prefers the viewport
  // center; when that spot is already occupied it drops below all existing
  // content, so consecutive batches never stack on top of each other.
  const rows: Array<Array<{ galleryId: string; assetId: TLAssetId; w: number; h: number }>> = []
  for (let index = 0; index < landed.length; index += GRID_COLS) rows.push(landed.slice(index, index + GRID_COLS))
  const rowSizes = rows.map(row => ({
    width: row.reduce((sum, cell) => sum + cell.w, 0) + GRID_GAP * (row.length - 1),
    height: Math.max(...row.map(cell => cell.h)),
  }))
  const blockWidth = Math.max(...rowSizes.map(size => size.width))
  const blockHeight = rowSizes.reduce((sum, size) => sum + size.height, 0) + GRID_GAP * (rows.length - 1)
  const viewport = editor.getViewportPageBounds()
  const originX = viewport.center.x - blockWidth / 2
  let originY = viewport.center.y - blockHeight / 2

  const existing = editor.getCurrentPageShapes()
  if (existing.length > 0) {
    // Cushion the candidate by half a gap so landed batches keep breathing room.
    const cushion = GRID_GAP / 2
    const candidateX = originX - cushion
    const candidateY = originY - cushion
    const candidateW = blockWidth + cushion * 2
    const candidateH = blockHeight + cushion * 2
    let occupied = false
    let contentBottom = Number.NEGATIVE_INFINITY
    for (const shape of existing) {
      const bounds = editor.getShapePageBounds(shape.id)
      if (bounds === undefined) continue
      if (bounds.maxY > contentBottom) contentBottom = bounds.maxY
      if (!occupied
        && candidateX < bounds.maxX && candidateX + candidateW > bounds.minX
        && candidateY < bounds.maxY && candidateY + candidateH > bounds.minY) {
        occupied = true
      }
    }
    if (occupied) originY = contentBottom + GRID_GAP
  }
  let cursorY = originY
  const shapes: TLCreateShapePartial<TLImageShape>[] = []
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex]!
    const rowSize = rowSizes[rowIndex]!
    let cursorX = originX + (blockWidth - rowSize.width) / 2
    for (const cell of row) {
      shapes.push({
        id: createShapeId(),
        type: 'image',
        x: Math.round(cursorX),
        y: Math.round(cursorY),
        props: { assetId: cell.assetId, w: cell.w, h: cell.h },
        meta: { galleryId: cell.galleryId },
      })
      cursorX += cell.w + GRID_GAP
    }
    cursorY += rowSize.height + GRID_GAP
  }
  editor.createShapes(shapes)

  // When the batch landed outside the visible viewport (e.g. below older
  // content), bring it into view: pan if it fits at the current zoom,
  // otherwise zoom out just enough to frame it.
  const visible = originX >= viewport.minX && originY >= viewport.minY
    && originX + blockWidth <= viewport.maxX && originY + blockHeight <= viewport.maxY
  if (!visible) {
    if (blockWidth <= viewport.w && blockHeight <= viewport.h) {
      editor.centerOnPoint({ x: originX + blockWidth / 2, y: originY + blockHeight / 2 }, { animation: { duration: 240 } })
    } else {
      editor.zoomToBounds({ x: originX, y: originY, w: blockWidth, h: blockHeight }, { animation: { duration: 240 }, inset: GRID_GAP })
    }
  }
}

export const StudioTlCanvas: FC = memo(function StudioTlCanvas() {
  const editorRef = useRef<Editor | null>(null)
  const landingRef = useRef(false)
  /** Per-canvas attachment misses, so one bad blob cannot spin the reconcile. */
  const failedRef = useRef(new Set<string>())

  const processQueue = useCallback(() => {
    const editor = editorRef.current
    if (editor === null) return
    if (landingRef.current) return
    const landedIds = landedIdsOf(editor)
    const items = getTlLandings().filter(item => !landedIds.has(item.galleryId) && !failedRef.current.has(item.galleryId))
    if (items.length === 0) return
    landingRef.current = true
    void landTlItems(editor, items, failedRef.current)
      .catch(error => {
        console.warn('[dsh-image-gen] tldraw canvas landing failed:', error)
      })
      .finally(() => {
        landingRef.current = false
        // Items pushed while a landing was in flight are reconciled now.
        processQueue()
      })
  }, [])

  useEffect(() => subscribeTlLandings(processQueue), [processQueue])

  return (
    <div className="dsh-ig-tl-canvas">
      {/* No persistenceKey: the canvas is a session-scratch surface. Unsaved
          generations must vanish on restart (save-first philosophy, same as
          the previous preview pane); saved images remain in the gallery. */}
      <Tldraw
        onMount={editor => {
          editorRef.current = editor
          // One console line proves the editor booted inside the webview;
          // useful when the host page swallows render errors.
          console.info(`[dsh-image-gen] tldraw mounted (instance ${editor.id})`)
          processQueue()
          // Mirror this canvas into the host so the conversation agent can
          // see it (canvas_state / view_canvas / edit_image canvas_selection).
          const stopSync = startCanvasSync(editor)
          return () => {
            stopSync()
            editorRef.current = null
          }
        }}
      />
    </div>
  )
})
