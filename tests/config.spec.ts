import { describe, expect, it } from 'vitest'
import { Config } from '../src/config.js'

describe('Config Schema validation', () => {
  it('defaults to the GPT engine and preserves workspace defaults', () => {
    expect(Config({})).toMatchObject({
      engine: 'gpt',
      saveToWorkspace: true,
      workspaceFolder: 'dsh-image-gen',
    })
  })

  it('rejects provider names outside the CPA engine contract', () => {
    expect(() => Config({ engine: 'google' as never })).toThrow()
  })

  it('accepts the Gemini engine', () => {
    expect(Config({ engine: 'gemini' }).engine).toBe('gemini')
  })
})
