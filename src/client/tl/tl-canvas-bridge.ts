/**
 * Landing queue between studio generation results and the tldraw canvas.
 *
 * Generation paths (single, multi-image, multi-model comparison) push items
 * here; the mounted tldraw surface drains the queue. If the canvas is not
 * mounted (preview mode), items wait in memory and land on the next mount.
 * Nothing here or on the canvas survives a restart: the tldraw surface runs
 * without persistenceKey, so unsaved generations vanish on reload - the
 * gallery remains the only durable store (save-first philosophy).
 */
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'

export interface TlLandingItem {
  /** Gallery item id; also used to dedupe shapes via shape.meta.galleryId. */
  galleryId: string
  attachment: ImageAttachmentRef
}

type TlLandingListener = () => void

const pending: TlLandingItem[] = []
const listeners = new Set<TlLandingListener>()

/** Queue freshly generated images for the tldraw canvas. Safe to call anywhere. */
export function pushTlLandings(items: readonly TlLandingItem[]): void {
  if (items.length === 0) return
  // Enqueue dedupe: chat-panel remounts re-pull tool events, and re-pushing
  // the same galleryId here would double-land it on the canvas (the landing
  // filter only dedupes against shapes already on the page).
  const known = new Set(pending.map(item => item.galleryId))
  let pushed = 0
  for (const item of items) {
    if (known.has(item.galleryId)) continue
    pending.push(item)
    known.add(item.galleryId)
    pushed += 1
  }
  if (pushed === 0) return
  for (const listener of listeners) listener()
}

/** Take and clear everything currently queued. */
export function takeTlLandings(): TlLandingItem[] {
  if (pending.length === 0) return []
  const drained = pending.splice(0, pending.length)
  return drained
}

/** Subscribe to queue pushes. Returns an unsubscribe function. */
export function subscribeTlLandings(listener: TlLandingListener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
