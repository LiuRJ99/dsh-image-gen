/**
 * Landing queue between studio generation results and the tldraw canvas.
 *
 * Generation paths (single, multi-image, multi-model comparison) push items
 * here; the mounted tldraw surface drains the queue. If the canvas is not
 * mounted (preview mode), items wait in memory and land on the next mount.
 * The queue is intentionally not persisted: shapes restored from IndexedDB
 * already carry the landed images as asset data URLs.
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
  pending.push(...items)
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
