/**
 * Landing bus between studio generation results and the tldraw canvases.
 *
 * Generation paths (single, multi-image, multi-model comparison, chat tool
 * cards) push items here; every mounted tldraw surface reconciles against the
 * full list. More than one canvas can be mounted at once (the conversation-view
 * gallery tab and the right-sidebar studio tab), so the bus broadcasts instead
 * of draining: each canvas lands the items its own page does not carry yet
 * (per-canvas galleryId dedupe) and re-reads on every push. If no canvas is
 * mounted, items wait in memory and land on the next mount. Nothing here or on
 * any canvas survives a restart: the tldraw surfaces run without
 * persistenceKey, so unsaved generations vanish on reload - the gallery
 * remains the only durable store (save-first philosophy).
 */
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'

export interface TlLandingItem {
  /** Gallery item id; also used to dedupe shapes via shape.meta.galleryId. */
  galleryId: string
  attachment: ImageAttachmentRef
}

type TlLandingListener = () => void

const items: TlLandingItem[] = []
const listeners = new Set<TlLandingListener>()

/** Queue freshly generated images for the tldraw canvases. Safe to call anywhere. */
export function pushTlLandings(newItems: readonly TlLandingItem[]): void {
  if (newItems.length === 0) return
  // Enqueue dedupe: chat-panel remounts re-pull tool events, and re-pushing
  // the same galleryId here would duplicate the reconcile work on every
  // canvas (the landing filter also dedupes against shapes already on each
  // page, but the bus list itself stays the session-scratch record).
  const known = new Set(items.map(item => item.galleryId))
  let pushed = 0
  for (const item of newItems) {
    if (known.has(item.galleryId)) continue
    items.push(item)
    known.add(item.galleryId)
    pushed += 1
  }
  if (pushed === 0) return
  for (const listener of listeners) listener()
}

/**
 * Read every item landed so far in this browser session.
 *
 * The list is the in-memory session-scratch record shared by all canvases:
 * reading never removes items, so a canvas mounted later (or a second canvas
 * mounted beside the first) reconciles the same set. The list dies with the
 * page, which is exactly the "unsaved content does not survive a restart"
 * semantic the studio canvas keeps.
 */
export function getTlLandings(): readonly TlLandingItem[] {
  return items
}

/** Subscribe to queue pushes. Returns an unsubscribe function. */
export function subscribeTlLandings(listener: TlLandingListener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
