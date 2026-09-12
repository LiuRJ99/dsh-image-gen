import { describe, expect, it, vi } from 'vitest'

import { ensureCssSupports } from '../src/client/tl/css-supports-shim.js'

describe('css supports shim (#40)', () => {
  it('installs a fallback that returns false when supports is missing', () => {
    const cssLike: { supports?: unknown } = {}
    ensureCssSupports(cssLike)
    expect(typeof cssLike.supports).toBe('function')
    expect((cssLike.supports as (prop: string, value: string) => boolean)('color', 'color(display-p3 1 1 1)')).toBe(false)
  })

  it('overwrites a non-function supports value', () => {
    const cssLike: { supports?: unknown } = { supports: 'broken' }
    ensureCssSupports(cssLike)
    expect(typeof cssLike.supports).toBe('function')
  })

  it('never touches an existing native implementation', () => {
    const native = vi.fn().mockReturnValue(true)
    const cssLike: { supports?: unknown } = { supports: native }
    ensureCssSupports(cssLike)
    expect(cssLike.supports).toBe(native)
    expect(native).not.toHaveBeenCalled()
  })
})
