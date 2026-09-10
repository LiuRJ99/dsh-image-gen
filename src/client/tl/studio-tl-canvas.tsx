import { memo, type FC } from 'react'
import { Tldraw } from 'tldraw'

/**
 * Infinite canvas surface for the Studio workbench, backed by tldraw.
 *
 * Spike scope: prove the tldraw editor boots inside the DSH webview
 * (host React 18 + single-file CJS bundle with everything inlined), shows
 * the licensed "Made with tldraw" watermark, and persists the document in
 * IndexedDB through `persistenceKey`. Landing generation results on the
 * canvas is deliberately out of scope here - that is the next phase.
 */
export const StudioTlCanvas: FC = memo(function StudioTlCanvas() {
  return (
    <div className="dsh-ig-tl-canvas">
      <Tldraw
        persistenceKey="dsh-image-gen-studio"
        onMount={editor => {
          // One console line proves the editor booted inside the webview;
          // useful when the host page swallows render errors.
          console.info(`[dsh-image-gen] tldraw mounted (instance ${editor.id})`)
        }}
      />
    </div>
  )
})
