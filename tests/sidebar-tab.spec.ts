import { describe, expect, it, vi } from 'vitest'
import {
  GALLERY_TAB_ID,
  getBetterSidebarService,
  registerBetterSidebarTab,
} from '../src/client/sidebar-tab.js'
import type { TabDescriptor } from 'dsh-better-sidebar/client/service'

describe('sidebar-tab integration', () => {
  it('defines stable GALLERY_TAB_ID', () => {
    expect(GALLERY_TAB_ID).toBe('dsh-image-gen:gallery')
  })

  it('safely returns undefined when betterSidebar service is missing', () => {
    const ctx = {
      get: (_name: string) => undefined,
    }
    expect(getBetterSidebarService(ctx)).toBeUndefined()
    const reg = registerBetterSidebarTab(ctx)
    expect(reg.available).toBe(false)
  })

  it('safely returns undefined when ctx.get throws or returns invalid object', () => {
    const ctxThrows = {
      get: () => {
        throw new Error('boom')
      },
    }
    expect(getBetterSidebarService(ctxThrows)).toBeUndefined()

    const ctxInvalid = {
      get: (_name: string) => ({ notRegisterTab: true }),
    }
    expect(getBetterSidebarService(ctxInvalid)).toBeUndefined()
  })

  it('registers Gallery tab descriptor when betterSidebar service is present', () => {
    let registeredDescriptor: TabDescriptor | undefined
    const mockUnregister = vi.fn()
    const mockService = {
      features: ['openFile'],
      registerTab: vi.fn((desc: TabDescriptor) => {
        registeredDescriptor = desc
        return mockUnregister
      }),
    }

    const ctx = {
      get: (name: string) => (name === 'betterSidebar' ? mockService : undefined),
    }

    const mockLocale = {
      getSnapshot: () => ({ active: 'zh-CN' }),
      subscribe: vi.fn(() => () => {}),
    }

    const reg = registerBetterSidebarTab(ctx, mockLocale as any)
    expect(reg.available).toBe(true)
    expect(mockService.registerTab).toHaveBeenCalledTimes(1)
    expect(registeredDescriptor).toBeDefined()
    expect(registeredDescriptor?.id).toBe(GALLERY_TAB_ID)
    expect(registeredDescriptor?.order).toBe(70)
    expect(registeredDescriptor?.single).toBe(true)

    // Test title i18n
    if (typeof registeredDescriptor?.title === 'function') {
      expect(registeredDescriptor.title()).toBe('画廊')
    }

    // Call disposer
    reg.disposer?.()
    expect(mockUnregister).toHaveBeenCalledTimes(1)
  })

  it('renders title as "Gallery" when locale is English', () => {
    let registeredDescriptor: TabDescriptor | undefined
    const mockService = {
      features: [],
      registerTab: vi.fn((desc: TabDescriptor) => {
        registeredDescriptor = desc
        return () => {}
      }),
    }

    const ctx = {
      get: (name: string) => (name === 'betterSidebar' ? mockService : undefined),
    }

    const mockLocaleEn = {
      getSnapshot: () => ({ active: 'en-US' }),
      subscribe: vi.fn(() => () => {}),
    }

    const reg = registerBetterSidebarTab(ctx, mockLocaleEn as any)
    expect(reg.available).toBe(true)
    if (typeof registeredDescriptor?.title === 'function') {
      expect(registeredDescriptor.title()).toBe('Gallery')
    }
  })
})
