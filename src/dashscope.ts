/** DashScope (Aliyun Wanx & Qwen-Image) image-generation protocol adapter. */
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'

export interface DashScopeImageOptions {
  apiKey: string
  endpoint: string
  model: string
  prompt: string
  size?: string
  maxBytes: number
  signal?: AbortSignal
}

interface DashScopeOutputResult {
  url?: string
}

interface DashScopeChoiceMessageContent {
  text?: string
  image?: string
  image_url?: string
  url?: string
}

interface DashScopeTaskResponse {
  output?: {
    task_id?: string
    task_status?: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'UNKNOWN'
    results?: DashScopeOutputResult[]
    choices?: Array<{ message?: { content?: DashScopeChoiceMessageContent[] } }>
    message?: string
  }
  message?: string
  code?: string
}

/** Call DashScope image synthesis/generation API and handle both synchronous output & async task polling. */
export async function generateDashScopeImage(options: DashScopeImageOptions): Promise<{
  data: Uint8Array
  mediaType: ImageAttachmentRef['mediaType']
}> {
  const base = options.endpoint.replace(/\/+$/, '')
  // Format size: DashScope expects format like "1024*1024" or "1280*720"
  const formattedSize = (options.size ?? '1024*1024').replace('x', '*')
  const isQwenImage = options.model.toLowerCase().startsWith('qwen-image')

  const submitUrl = isQwenImage
    ? `${base}/services/aigc/multimodal-generation/generation`
    : `${base}/services/aigc/text2image/image-synthesis`

  const requestBody = isQwenImage
    ? {
        model: options.model,
        input: {
          messages: [
            {
              role: 'user',
              content: [{ text: options.prompt }],
            },
          ],
        },
        parameters: {
          size: formattedSize,
        },
      }
    : {
        model: options.model,
        input: {
          prompt: options.prompt,
        },
        parameters: {
          size: formattedSize,
          n: 1,
        },
      }

  const submitResponse = await fetch(submitUrl, {
    method: 'POST',
    ...(options.signal ? { signal: options.signal } : {}),
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${options.apiKey}`,
      'X-DashScope-Async': 'enable',
    },
    body: JSON.stringify(requestBody),
  })

  if (!submitResponse.ok) {
    const errorText = await submitResponse.text()
    throw new Error(`DashScope image generation failed (${String(submitResponse.status)}): ${errorText}`)
  }

  const submitResult = (await submitResponse.json()) as DashScopeTaskResponse

  // Check if image URL is returned directly (synchronous completion)
  const directImageUrl = extractImageUrl(submitResult)
  if (directImageUrl !== undefined) {
    return downloadImageBlob(directImageUrl, options)
  }

  // Otherwise, handle async task polling
  const taskId = submitResult.output?.task_id
  if (taskId === undefined || taskId.length === 0) {
    throw new Error(`DashScope did not return an image URL or task_id: ${submitResult.message ?? JSON.stringify(submitResult)}`)
  }

  // Poll for completion (up to 60 seconds)
  const taskQueryUrl = `${base}/tasks/${taskId}`
  const startTime = Date.now()
  const timeoutMs = 60_000

  while (Date.now() - startTime < timeoutMs) {
    if (options.signal?.aborted) {
      throw new Error('DashScope image task polling aborted')
    }

    // Wait 1.5 seconds between polling checks
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, 1500)
      if (options.signal !== undefined) {
        options.signal.addEventListener('abort', () => {
          clearTimeout(timer)
          reject(new Error('DashScope image generation aborted'))
        }, { once: true })
      }
    })

    const taskResponse = await fetch(taskQueryUrl, {
      method: 'GET',
      ...(options.signal ? { signal: options.signal } : {}),
      headers: {
        authorization: `Bearer ${options.apiKey}`,
      },
    })

    if (!taskResponse.ok) {
      const errorText = await taskResponse.text()
      throw new Error(`DashScope task query failed (${String(taskResponse.status)}): ${errorText}`)
    }

    const taskResult = (await taskResponse.json()) as DashScopeTaskResponse
    const status = taskResult.output?.task_status

    if (status === 'SUCCEEDED') {
      const imageUrl = extractImageUrl(taskResult)
      if (imageUrl === undefined || imageUrl.length === 0) {
        throw new Error('DashScope task succeeded but returned no image URL')
      }
      return downloadImageBlob(imageUrl, options)
    }

    if (status === 'FAILED') {
      throw new Error(`DashScope image generation failed: ${taskResult.output?.message ?? taskResult.message ?? 'Unknown error'}`)
    }
  }

  throw new Error(`DashScope image generation timed out after ${String(timeoutMs / 1000)} seconds`)
}

function extractImageUrl(response: DashScopeTaskResponse): string | undefined {
  // 1. Text2Image output results format
  const resultUrl = response.output?.results?.[0]?.url
  if (resultUrl !== undefined && resultUrl.length > 0) return resultUrl

  // 2. Multimodal choices format
  const contents = response.output?.choices?.[0]?.message?.content
  if (Array.isArray(contents)) {
    for (const item of contents) {
      if (item.image !== undefined && item.image.length > 0) return item.image
      if (item.image_url !== undefined && item.image_url.length > 0) return item.image_url
      if (item.url !== undefined && item.url.length > 0) return item.url
    }
  }

  return undefined
}

async function downloadImageBlob(
  imageUrl: string,
  options: DashScopeImageOptions,
): Promise<{ data: Uint8Array; mediaType: ImageAttachmentRef['mediaType'] }> {
  const imageResponse = await fetch(imageUrl, {
    ...(options.signal ? { signal: options.signal } : {}),
  })

  if (!imageResponse.ok) {
    throw new Error(`Failed to fetch DashScope image from URL (${String(imageResponse.status)})`)
  }

  const buffer = await imageResponse.arrayBuffer()
  if (buffer.byteLength > options.maxBytes) {
    throw new Error(`DashScope generated image (${String(buffer.byteLength)} bytes) exceeds the ${String(options.maxBytes)} byte limit`)
  }

  const contentType = imageResponse.headers.get('content-type')
  const mediaType: ImageAttachmentRef['mediaType'] =
    contentType?.includes('png') ? 'image/png' :
    contentType?.includes('webp') ? 'image/webp' :
    'image/jpeg'

  return { data: new Uint8Array(buffer), mediaType }
}
