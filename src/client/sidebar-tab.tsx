/**
 * Optional DSH-better-sidebar integration for dsh-image-gen.
 *
 * Exposes the Gallery view as a first-class tab in dsh-better-sidebar.
 * Interacts with the host through ctx.get('betterSidebar').
 *
 * @module dsh-image-gen/client/sidebar-tab
 */
import type {
  BetterSidebarService,
  SessionScope,
  TabComponentProps,
  TabDescriptor,
} from 'dsh-better-sidebar/client/service'
import { GalleryViewTab, type LocaleService } from './gallery-view.js'

/** The stable tab type owned by this plugin. */
export const GALLERY_TAB_ID = 'dsh-image-gen:gallery'

/** Minimal context face shared with Cordis runtime. */
export interface SidebarTabContextFace {
  get?(name: string): unknown
  effect?(fn: () => unknown, label?: string): void
}

/** Result of probing/registering the optional service. */
export interface BetterSidebarRegistration {
  /** Whether the service was present and the tab registration was attempted. */
  available: boolean
  /** The service instance used for this registration. */
  service?: BetterSidebarService
  /** Disposer for the registered tab. */
  disposer?: () => void
}

/** Safely read the optional service from a Cordis context. */
export function getBetterSidebarService(ctx: { get?(name: string): unknown }): BetterSidebarService | undefined {
  try {
    const service = ctx.get?.('betterSidebar') as BetterSidebarService | undefined
    if (service === undefined || typeof service.registerTab !== 'function') return undefined
    return service
  } catch {
    return undefined
  }
}

/**
 * Register the Gallery as one Better Sidebar tab when the optional plugin is present.
 */
export function registerBetterSidebarTab(
  ctx: SidebarTabContextFace,
  locale?: LocaleService,
): BetterSidebarRegistration {
  const service = getBetterSidebarService(ctx)
  if (service === undefined) return { available: false }

  const descriptor: TabDescriptor = {
    id: GALLERY_TAB_ID,
    title: () => {
      const active = locale?.getSnapshot?.()?.active
      return active?.startsWith('en') ? 'Gallery' : '画廊'
    },
    order: 70,
    single: true,
    icon: (size: number) => (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        style={{ display: 'block' }}
      >
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <polyline points="21 15 16 10 5 21" />
      </svg>
    ),
    component: ({ scope, visible }: TabComponentProps) => {
      return (
        <div
          className="dsh-ig-sidebar-tab"
          data-dsh-ig-sidebar-tab=""
          style={{ height: '100%', width: '100%', overflow: 'hidden' }}
        >
          <GalleryViewTab locale={locale} scope={scope} visible={visible} />
        </div>
      )
    },
  }

  try {
    const disposer = service.registerTab(descriptor)
    return { available: true, service, disposer }
  } catch (error) {
    console.warn('[dsh-image-gen] Failed to register better-sidebar tab:', error)
    return { available: false }
  }
}
