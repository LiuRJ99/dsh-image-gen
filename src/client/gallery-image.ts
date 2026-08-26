/**
 * Browser-side image loading for gallery views.
 *
 * Cards, list rows, and table rows load a small WebP thumbnail; the lightbox
 * loads the full-resolution original on demand. Each component instance owns
 * its fetch and object URL: in-flight requests are aborted and object URLs are
 * revoked the moment the component unmounts, so scrolling a virtualized list
 * does not accumulate decoded image memory.
 */
import { useEffect, useState } from 'react'
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import { IMAGE_ROUTE } from '../shared.js'

/** What to request from the image route. */
export type ImageKind = 'full' | 'thumb'

/** Default thumbnail width shared with the server-side clamp. */
export const DEFAULT_THUMB_WIDTH = 300

export interface GalleryImageState {
  url: string | undefined
  blob: Blob | undefined
  loading: boolean
  error: string | undefined
}

/** Build the POST body the image route expects (kept in one place). */
export function buildImageRequestBody(ref: ImageAttachmentRef, kind: ImageKind, thumbWidth: number): string {
  return kind === 'thumb'
    ? JSON.stringify({ attachment: ref, kind, thumbWidth })
    : JSON.stringify({ attachment: ref, kind })
}

/**
 * Load one gallery image and keep its object URL alive only while the calling
 * component is mounted. Pass `kind: 'thumb'` for card/list/table thumbnails and
 * `kind: 'full'` for the lightbox.
 */
export function useGalleryImage(ref: ImageAttachmentRef, kind: ImageKind = 'full', thumbWidth: number = DEFAULT_THUMB_WIDTH): GalleryImageState {
  const [url, setUrl] = useState<string>()
  const [blob, setBlob] = useState<Blob>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()

  const key = ref.attachmentId

  useEffect(() => {
    const controller = new AbortController()
    let objectUrl: string | undefined
    let active = true

    void fetch(IMAGE_ROUTE, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'content-type': 'application/json' },
      body: buildImageRequestBody(ref, kind, thumbWidth),
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const resBlob = await response.blob()
        if (!active || controller.signal.aborted) return
        setBlob(resBlob)
        objectUrl = URL.createObjectURL(resBlob)
        setUrl(objectUrl)
        setLoading(false)
      })
      .catch((err) => {
        if (active && !controller.signal.aborted) {
          setError(err instanceof Error ? err.message : String(err))
          setLoading(false)
        }
      })

    return () => {
      active = false
      controller.abort()
      if (objectUrl !== undefined) URL.revokeObjectURL(objectUrl)
    }
    // `key` is the content-addressed attachment id; kind/width are stable per
    // call site. Re-running only on the attachment identity avoids refetching
    // when unrelated props change.
  }, [key])

  return { url, blob, loading, error }
}
