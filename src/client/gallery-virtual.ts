/**
 * Minimal row-windowing primitives for the gallery views.
 *
 * The gallery body is a single vertical scroll container. Each view mode maps
 * its items onto fixed-height "rows" (grid bands, list rows, or table rows) so
 * only the visible window is mounted — the rest of the list is a spacer, which
 * decouples DOM/decoded-image memory from the size of the gallery.
 */
import { useEffect, useState, type RefObject } from 'react'

/** Grid horizontal gap in px (must match `.dsh-ig-gallery-grid` / row gap). */
export const GRID_GAP = 20
/** Minimum grid cell width in px (must match `minmax(240px,1fr)`). */
export const GRID_MIN_CELL = 240
/** Fixed grid card meta height in px (must match `.dsh-ig-gallery-card-meta` height). */
export const GRID_META_HEIGHT = 90
/** List row height in px, item + vertical gap (must fit a 3-line prompt). */
export const LIST_ROW_HEIGHT = 144
/** Table row height in px (must match `.dsh-ig-gallery-table-row`). */
export const TABLE_ROW_HEIGHT = 64
/** Table header height in px (must match `.dsh-ig-gallery-table thead th`). */
export const TABLE_HEADER_HEIGHT = 41
/** Horizontal padding on the gallery body in px (must match `.dsh-ig-gallery-page-body`). */
export const BODY_PADDING_X = 28
/** Rows rendered above and below the visible window. */
export const OVERSCAN_ROWS = 3

export interface VirtualWindow {
  /** First visible row index (inclusive). */
  start: number
  /** One past the last visible row index. */
  end: number
  /** Total scrollable content height in px (header + rows). */
  totalHeight: number
  /** Top spacer height in px (rows above the window). */
  padTop: number
  /** Bottom spacer height in px (rows below the window). */
  padBottom: number
}

/** Number of grid columns that fit a content width. */
export function gridColumns(contentWidth: number): number {
  if (!Number.isFinite(contentWidth) || contentWidth <= GRID_MIN_CELL) return 1
  return Math.max(1, Math.floor((contentWidth + GRID_GAP) / (GRID_MIN_CELL + GRID_GAP)))
}

/** Fixed grid cell width for a content width and column count. */
export function gridCellWidth(contentWidth: number, columns: number): number {
  if (columns <= 1) return Math.max(GRID_MIN_CELL, contentWidth)
  return (contentWidth - (columns - 1) * GRID_GAP) / columns
}

/** Fixed grid row height (media square + meta + row gap). */
export function gridRowHeight(cellWidth: number): number {
  return cellWidth + GRID_META_HEIGHT + GRID_GAP
}

/**
 * Pure window calculation (exported for tests).
 * @param scrollTop     current scroll offset of the container.
 * @param viewportHeight container client height.
 * @param rowCount      total number of virtualized rows.
 * @param rowHeight     fixed height of one row in px (gap folded in).
 * @param offsetTop     fixed content height above the rows (e.g. table header).
 */
export function computeWindow(
  scrollTop: number,
  viewportHeight: number,
  rowCount: number,
  rowHeight: number,
  offsetTop = 0,
): VirtualWindow {
  const safeRowHeight = Math.max(rowHeight, 1)
  const totalHeight = offsetTop + rowCount * rowHeight
  if (rowCount <= 0) return { start: 0, end: 0, totalHeight, padTop: 0, padBottom: 0 }
  const viewport = viewportHeight > 0 ? viewportHeight : 600
  const first = Math.floor(Math.max(0, scrollTop - offsetTop) / safeRowHeight)
  const visibleCount = Math.ceil(viewport / safeRowHeight) + 1
  const start = Math.max(0, first - OVERSCAN_ROWS)
  const end = Math.min(rowCount, first + visibleCount + OVERSCAN_ROWS)
  return {
    start,
    end,
    totalHeight,
    padTop: start * rowHeight,
    padBottom: Math.max(0, rowCount * rowHeight - end * rowHeight),
  }
}

/** Track a scroll container's scrollTop and viewport height. */
export function useVirtualWindow(
  scrollRef: RefObject<HTMLElement | null>,
  rowCount: number,
  rowHeight: number,
  offsetTop = 0,
): VirtualWindow {
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(0)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    const measure = () => {
      setScrollTop(el.scrollTop)
      setViewportHeight(el.clientHeight)
    }
    measure()

    el.addEventListener('scroll', measure, { passive: true })
    let observer: ResizeObserver | undefined
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(measure)
      observer.observe(el)
    }
    return () => {
      el.removeEventListener('scroll', measure)
      observer?.disconnect()
    }
  }, [scrollRef])

  return computeWindow(scrollTop, viewportHeight, rowCount, rowHeight, offsetTop)
}

/** Track an element's content width (clientWidth), re-measured on resize. */
export function useContainerWidth(ref: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => setWidth(el.clientWidth)
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref])
  return width
}
