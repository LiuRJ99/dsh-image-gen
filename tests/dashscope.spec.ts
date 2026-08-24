import { afterEach, describe, expect, it, vi } from 'vitest'
import { generateDashScopeImage } from '../src/dashscope.js'

const signal = new AbortController().signal
const endpoint = 'https://dashscope.aliyuncs.com/api/v1'
const imagePngBytes = Buffer.from('fake-dashscope-png-bytes')

afterEach(() => {
  vi.unstubAllGlobals()
})

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  })
}

function imageResponse(bytes: Buffer, contentType = 'image/png'): Response {
  return new Response(bytes, {
    status: 200,
    headers: { 'content-type': contentType },
  })
}

describe('generateDashScopeImage', () => {
  it('handles synchronous direct image URL return', async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const urlStr = String(url)
      if (urlStr.includes('/services/aigc/text2image/image-synthesis')) {
        return jsonResponse({
          output: {
            results: [{ url: 'https://dashscope-result.oss.aliyuncs.com/image.png' }],
          },
        })
      }
      if (urlStr === 'https://dashscope-result.oss.aliyuncs.com/image.png') {
        return imageResponse(imagePngBytes, 'image/png')
      }
      throw new Error(`Unexpected URL: ${urlStr}`)
    })

    vi.stubGlobal('fetch', fetchMock)

    const result = await generateDashScopeImage({
      apiKey: 'sk-dashscope-test',
      endpoint,
      model: 'wanx2.1-t2i-turbo',
      prompt: 'a tranquil lake in autumn',
      size: '1024*1024',
      maxBytes: 1024 * 1024,
      signal,
    })

    expect(result.mediaType).toBe('image/png')
    expect(result.data).toEqual(new Uint8Array(imagePngBytes))

    const [submitUrl, submitInit] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(submitUrl).toBe('https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis')
    expect(submitInit.headers).toMatchObject({
      'content-type': 'application/json',
      authorization: 'Bearer sk-dashscope-test',
      'X-DashScope-Async': 'enable',
    })
    expect(JSON.parse(submitInit.body as string)).toEqual({
      model: 'wanx2.1-t2i-turbo',
      input: { prompt: 'a tranquil lake in autumn' },
      parameters: { size: '1024*1024', n: 1 },
    })
  })

  it('handles multimodal qwen-image endpoint', async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const urlStr = String(url)
      if (urlStr.includes('/services/aigc/multimodal-generation/generation')) {
        return jsonResponse({
          output: {
            choices: [
              {
                message: {
                  content: [{ image: 'https://dashscope-result.oss.aliyuncs.com/qwen.png' }],
                },
              },
            ],
          },
        })
      }
      if (urlStr === 'https://dashscope-result.oss.aliyuncs.com/qwen.png') {
        return imageResponse(imagePngBytes, 'image/png')
      }
      throw new Error(`Unexpected URL: ${urlStr}`)
    })

    vi.stubGlobal('fetch', fetchMock)

    const result = await generateDashScopeImage({
      apiKey: 'sk-dashscope-test',
      endpoint,
      model: 'qwen-image-gen',
      prompt: 'cyberpunk city',
      size: '1024x1024',
      maxBytes: 1024 * 1024,
      signal,
    })

    expect(result.mediaType).toBe('image/png')
    expect(result.data).toEqual(new Uint8Array(imagePngBytes))
  })

  it('handles async task polling until SUCCEEDED', async () => {
    let pollCount = 0
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const urlStr = String(url)
      if (urlStr.includes('/services/aigc/text2image/image-synthesis')) {
        return jsonResponse({
          output: {
            task_id: 'task-12345',
            task_status: 'PENDING',
          },
        })
      }
      if (urlStr.includes('/tasks/task-12345')) {
        pollCount++
        if (pollCount === 1) {
          return jsonResponse({
            output: {
              task_id: 'task-12345',
              task_status: 'RUNNING',
            },
          })
        }
        return jsonResponse({
          output: {
            task_id: 'task-12345',
            task_status: 'SUCCEEDED',
            results: [{ url: 'https://dashscope-result.oss.aliyuncs.com/polled.png' }],
          },
        })
      }
      if (urlStr === 'https://dashscope-result.oss.aliyuncs.com/polled.png') {
        return imageResponse(imagePngBytes, 'image/png')
      }
      throw new Error(`Unexpected URL: ${urlStr}`)
    })

    vi.stubGlobal('fetch', fetchMock)

    const result = await generateDashScopeImage({
      apiKey: 'sk-dashscope-test',
      endpoint,
      model: 'wanx2.1-t2i-turbo',
      prompt: 'a snowy mountain',
      size: '1024*1024',
      maxBytes: 1024 * 1024,
      signal,
    })

    expect(result.mediaType).toBe('image/png')
    expect(result.data).toEqual(new Uint8Array(imagePngBytes))
    expect(pollCount).toBe(2)
  })

  it('throws when task polling reports FAILED', async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const urlStr = String(url)
      if (urlStr.includes('/services/aigc/text2image/image-synthesis')) {
        return jsonResponse({
          output: {
            task_id: 'task-failed',
            task_status: 'PENDING',
          },
        })
      }
      if (urlStr.includes('/tasks/task-failed')) {
        return jsonResponse({
          output: {
            task_id: 'task-failed',
            task_status: 'FAILED',
            message: 'Sensitive content detected',
          },
        })
      }
      throw new Error(`Unexpected URL: ${urlStr}`)
    })

    vi.stubGlobal('fetch', fetchMock)

    await expect(
      generateDashScopeImage({
        apiKey: 'sk-dashscope-test',
        endpoint,
        model: 'wanx2.1-t2i-turbo',
        prompt: 'illegal prompt',
        maxBytes: 1024 * 1024,
        signal,
      }),
    ).rejects.toThrow('DashScope image generation failed: Sensitive content detected')
  })

  it('throws upstream error on submit failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response('Invalid API key', { status: 401 }),
      ),
    )

    await expect(
      generateDashScopeImage({
        apiKey: 'invalid-key',
        endpoint,
        model: 'wanx2.1-t2i-turbo',
        prompt: 'test',
        maxBytes: 1024 * 1024,
        signal,
      }),
    ).rejects.toThrow('DashScope image generation failed (401): Invalid API key')
  })
})
