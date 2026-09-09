import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('../src/client/index.tsx', import.meta.url), 'utf8')

describe('dynamic CPA image model settings', () => {
  it('loads the dedicated image-model catalog instead of hardcoding model ids', () => {
    expect(source).toContain('IMAGE_MODELS_ROUTE')
    expect(source).toContain('fetch(IMAGE_MODELS_ROUTE')
    expect(source).toContain('parseImageModels')
    expect(source).toMatch(/models\.filter\(candidate => candidate\.engine === engine && candidate\.supportsGenerate\)/u)
    expect(source).not.toContain("<option value=\"gpt-image-2\">")
    expect(source).not.toContain("<option value=\"gemini-3.1-flash-image\">")
  })

  it('persists the selected model while retaining the legacy engine field', () => {
    expect(source).toContain("await props.scope.set('engine', engine)")
    expect(source).toContain("await props.scope.set('model', model.trim())")
  })
})
