/** Same-origin route exposing the CPA-owned image model catalog. */
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { CpaImageGenerationService } from './cpa-contract.js'
import { IMAGE_MODELS_ROUTE } from './shared.js'

export { IMAGE_MODELS_ROUTE } from './shared.js'

export interface ImageModelRouteDeps {
  getService(): CpaImageGenerationService | undefined
}

export async function serveImageModels(req: IncomingMessage, res: ServerResponse, deps: ImageModelRouteDeps): Promise<void> {
  if (req.method !== 'GET') return jsonError(res, 405, 'method-not-allowed')
  if (!sameOrigin(req)) return jsonError(res, 403, 'origin-rejected')
  const service = deps.getService()
  if (service === undefined || typeof service.listModels !== 'function') {
    return jsonError(res, 503, 'image-model-catalog-unavailable')
  }
  try {
    const models = await service.listModels()
    return json(res, 200, { models })
  } catch {
    return jsonError(res, 502, 'image-model-catalog-failed')
  }
}

function sameOrigin(req: IncomingMessage): boolean {
  const origin = req.headers.origin
  const host = req.headers.host
  if (origin === undefined) return true
  if (host === undefined) return false
  return origin === `http://${host}` || origin === `https://${host}`
}

function jsonError(res: ServerResponse, status: number, error: string): void {
  json(res, status, { error })
}

function json(res: ServerResponse, status: number, value: unknown): void {
  const body = JSON.stringify(value)
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(body)
}
