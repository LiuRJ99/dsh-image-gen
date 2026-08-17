import { describe, expect, it } from 'vitest'
import { DEFAULT_GOOGLE_ENDPOINT, DEFAULT_GOOGLE_MODEL, DEFAULT_OPENAI_BASE_URL, DEFAULT_OPENAI_MODEL, DEFAULT_SEEDREAM_BASE_URL, DEFAULT_SEEDREAM_MODEL, resolveProvider } from '../src/config.js'

describe('resolveProvider', () => {
  it('resolves the Google defaults', () => {
    expect(resolveProvider({})).toEqual({ provider: 'google', apiKeyEnv: 'GEMINI_API_KEY', endpoint: DEFAULT_GOOGLE_ENDPOINT, model: DEFAULT_GOOGLE_MODEL, aspectRatio: '1:1', imageSize: '1K' })
  })

  it('resolves editable OpenAI-compatible profiles independently', () => {
    expect(resolveProvider({ provider: 'openai' })).toEqual({ provider: 'openai', apiKeyEnv: 'OPENAI_API_KEY', baseURL: DEFAULT_OPENAI_BASE_URL, model: DEFAULT_OPENAI_MODEL, imageSize: '1024x1024' })
    expect(resolveProvider({ provider: 'seedream' })).toEqual({ provider: 'seedream', apiKeyEnv: 'ARK_API_KEY', baseURL: DEFAULT_SEEDREAM_BASE_URL, model: DEFAULT_SEEDREAM_MODEL, imageSize: '2K' })
  })
})
