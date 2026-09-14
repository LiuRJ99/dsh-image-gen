/**
 * Subscription-based image generation: the internal, self-contained channel.
 *
 * Login (PKCE loopback), token storage through the DSH Credentials service,
 * refresh and the wire calls all live in `./subscription/` — adapted from
 * @goodandready/dsh-subscriptions (MIT, (c) 2026 GooDAnDReaDY), trimmed to
 * the two image vendors this bundle ships. This file keeps the same
 * `{ data, mediaType }` contract as the API-key adapters so `saveGenerated`
 * and everything downstream is shared.
 *
 * Isolation invariants (project rules):
 * - OAuth blobs live under CODEX_OAUTH_1 / GROK_OAUTH_1 refs — never the
 *   API-key refs — and the API-key paths never consult subscription state.
 * - Login/logout changes nothing except one vendor's own blob.
 */
import type { ImageMediaType } from '@deepseek-ai/dsh-attachment'
import { detectImageMediaType } from './reference-image.js'
import { SubscriptionManager, vendorOf } from './subscription/manager.js'
import { SUBSCRIPTION_TIMEOUT_MS, type SubscriptionProvider } from './shared.js'

export { SubscriptionManager, vendorOf } from './subscription/manager.js'
export { registerSubscriptionRoutes } from './subscription/subscription-route.js'
export { SUBSCRIPTION_TIMEOUT_MS } from './shared.js'

/**
 * Generate one image through a logged-in subscription account. Returns the
 * same `{ data, mediaType }` contract as the API-key adapters so the caller
 * can feed it straight into `saveGenerated`. With sourceImages the call is
 * an edit: the vendor layer picks the channel's edit endpoint.
 */
export async function generateSubscriptionImage(options: {
  manager: SubscriptionManager
  provider: SubscriptionProvider
  prompt: string
  size?: string
  quality?: string
  sourceImages?: ReadonlyArray<{ data: Uint8Array; mediaType: ImageMediaType }>
  maxBytes: number
  signal: AbortSignal
}): Promise<{ data: Uint8Array; mediaType: ImageMediaType; revisedPrompt?: string }> {
  const { manager, provider, prompt, maxBytes, signal } = options
  const size = options.size?.trim()
  const sourceImages = options.sourceImages ?? []
  const result = await withTimeout(
    manager.generate({
      vendor: vendorOf(provider),
      prompt,
      ...(size !== undefined && size.length > 0 ? { size } : {}),
      ...(sourceImages.length > 0 ? { referenceImages: sourceImages } : {}),
      signal,
    }),
    signal,
  )
  const first = Array.isArray(result) ? result[0] : undefined
  if (first === undefined || typeof first.b64_json !== 'string' || first.b64_json.length === 0) {
    throw new Error('Subscription image reply contained no image payload')
  }
  const bytes = new Uint8Array(Buffer.from(first.b64_json, 'base64'))
  if (bytes.byteLength > maxBytes) {
    throw new Error(`Subscription image is ${formatBytes(bytes.byteLength)}, above this DSH's ${formatBytes(maxBytes)} limit`)
  }
  const mediaType = detectImageMediaType(bytes)
  if (mediaType === undefined) {
    throw new Error('Subscription image payload has an unrecognized format')
  }
  return {
    data: bytes,
    mediaType,
    ...(typeof first.revisedPrompt === 'string' && first.revisedPrompt.length > 0 ? { revisedPrompt: first.revisedPrompt } : {}),
  }
}

/** Run one promise with the subscription timeout and the call's abort signal. */
async function withTimeout<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  let rejectCall: (error: Error) => void
  const onAbort = (): void => { rejectCall(new Error('Subscription image generation aborted')) }
  const guarded = new Promise<T>((resolve, reject) => {
    rejectCall = reject
    timer = setTimeout(() => { reject(new Error(`Subscription image generation timed out after ${String(Math.round(SUBSCRIPTION_TIMEOUT_MS / 1000))}s`)) }, SUBSCRIPTION_TIMEOUT_MS)
    promise.then(resolve, reject)
  })
  signal.addEventListener('abort', onAbort, { once: true })
  try {
    return await guarded
  } finally {
    if (timer !== undefined) clearTimeout(timer)
    signal.removeEventListener('abort', onAbort)
  }
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${String(Math.round((bytes / (1024 * 1024)) * 10) / 10)}MB`
  return `${String(Math.round(bytes / 1024))}KB`
}