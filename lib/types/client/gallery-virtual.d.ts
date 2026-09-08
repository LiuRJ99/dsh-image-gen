/**
 * Minimal row-windowing primitives for the gallery views.
 *
 * The gallery body is a single vertical scroll container. Each view mode maps
 * its items onto fixed-height "rows" (grid bands, list rows, or table rows) so
 * only the visible window is mounted — the rest of the list is a spacer, which
 * decouples DOM/decoded-image memory from the size of the gallery.
 */
import { type RefObject } from 'react';
/** Grid horizontal gap in px (must match `.dsh-ig-gallery-grid` / row gap). */
export declare const GRID_GAP = 20;
/** Minimum grid cell width in px (must match `minmax(240px,1fr)`). */
export declare const GRID_MIN_CELL = 240;
/** Fixed grid card meta height in px (must match `.dsh-ig-gallery-card-meta` height). */
export declare const GRID_META_HEIGHT = 90;
/** List row height in px, item + vertical gap (must fit a 3-line prompt). */
export declare const LIST_ROW_HEIGHT = 144;
/** Table row height in px (must match `.dsh-ig-gallery-table-row`). */
export declare const TABLE_ROW_HEIGHT = 64;
/** Table header height in px (must match `.dsh-ig-gallery-table thead th`). */
export declare const TABLE_HEADER_HEIGHT = 41;
/** Horizontal padding on the gallery body in px (must match `.dsh-ig-gallery-page-body`). */
export declare const BODY_PADDING_X = 14;
/** Rows rendered above and below the visible window. */
export declare const OVERSCAN_ROWS = 3;
export interface VirtualWindow {
    /** First visible row index (inclusive). */
    start: number;
    /** One past the last visible row index. */
    end: number;
    /** Total scrollable content height in px (header + rows). */
    totalHeight: number;
    /** Top spacer height in px (rows above the window). */
    padTop: number;
    /** Bottom spacer height in px (rows below the window). */
    padBottom: number;
}
/** Number of grid columns that fit a content width. */
export declare function gridColumns(contentWidth: number): number;
/** Fixed grid cell width for a content width and column count. */
export declare function gridCellWidth(contentWidth: number, columns: number): number;
/** Fixed grid row height (media square + meta + row gap). */
export declare function gridRowHeight(cellWidth: number): number;
/**
 * Pure window calculation (exported for tests).
 * @param scrollTop     current scroll offset of the container.
 * @param viewportHeight container client height.
 * @param rowCount      total number of virtualized rows.
 * @param rowHeight     fixed height of one row in px (gap folded in).
 * @param offsetTop     fixed content height above the rows (e.g. table header).
 */
export declare function computeWindow(scrollTop: number, viewportHeight: number, rowCount: number, rowHeight: number, offsetTop?: number): VirtualWindow;
/** Track a scroll container's scrollTop and viewport height. */
export declare function useVirtualWindow(scrollRef: RefObject<HTMLElement | null>, rowCount: number, rowHeight: number, offsetTop?: number): VirtualWindow;
/** Track an element's content width (clientWidth), re-measured on resize. */
export declare function useContainerWidth(ref: RefObject<HTMLElement | null>): number;
