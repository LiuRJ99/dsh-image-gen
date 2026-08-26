import { describe, expect, it } from 'vitest'
import { computeWindow, gridColumns, gridCellWidth, gridRowHeight } from '../src/client/gallery-virtual.js'

describe('gridColumns', () => {
  it('returns at least one column', () => {
    expect(gridColumns(0)).toBe(1)
    expect(gridColumns(100)).toBe(1)
  })
  it('grows with width', () => {
    expect(gridColumns(560)).toBe(2)
    expect(gridColumns(1000)).toBe(3)
  })
})

describe('gridCellWidth', () => {
  it('fills a single column to at least min width', () => {
    expect(gridCellWidth(300, 1)).toBeGreaterThanOrEqual(240)
  })
  it('distributes width across columns minus gaps', () => {
    const width = 1000
    const cols = gridColumns(width)
    expect(cols).toBe(3)
    expect(gridCellWidth(width, cols)).toBeCloseTo((1000 - 2 * 20) / 3)
  })
})

describe('gridRowHeight', () => {
  it('adds meta and gap to the square media height', () => {
    expect(gridRowHeight(300)).toBe(300 + 90 + 20)
  })
})

describe('computeWindow', () => {
  it('returns empty for zero rows', () => {
    expect(computeWindow(0, 600, 0, 120)).toMatchObject({ start: 0, end: 0, totalHeight: 0 })
  })

  it('windows the first rows at the top', () => {
    const win = computeWindow(0, 600, 100, 120)
    expect(win.start).toBe(0)
    expect(win.end).toBeGreaterThan(win.start)
    expect(win.padTop).toBe(0)
  })

  it('advances the window as scrollTop grows', () => {
    const win = computeWindow(1200, 600, 100, 120)
    expect(win.start).toBeGreaterThan(0)
    expect(win.end).toBeLessThanOrEqual(100)
    expect(win.padTop).toBe(win.start * 120)
  })

  it('accounts for an offset header (table)', () => {
    const win = computeWindow(0, 600, 100, 64, 41)
    expect(win.start).toBe(0)
    expect(win.totalHeight).toBe(41 + 100 * 64)
    expect(win.padBottom).toBe(100 * 64 - win.end * 64)
  })

  it('clamps the window to the row count', () => {
    const win = computeWindow(1_000_000, 600, 10, 120)
    expect(win.end).toBe(10)
    expect(win.padBottom).toBe(0)
  })
})
