/**
 * React context bridge between the canvas workspace and its node components.
 * Callbacks live here (not in node data) so persisted documents stay plain JSON.
 */
import { createContext, useContext } from 'react'
import type { StudioProviderProfile } from '../../shared.js'

export interface CanvasBridge {
  updateNodeData: (nodeId: string, patch: Record<string, unknown>) => void
  requestGenerate: (nodeId: string) => void
  deleteNode: (nodeId: string) => void
  profiles: readonly StudioProviderProfile[]
  lang: 'zh' | 'en'
}

export const CanvasBridgeContext = createContext<CanvasBridge | undefined>(undefined)

export function useCanvasBridge(): CanvasBridge | undefined {
  return useContext(CanvasBridgeContext)
}
