import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

type PackageManifest = {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  scripts?: Record<string, string>
  files?: string[]
  dsh?: { bundle?: { patch?: string }; client?: { inject?: string[] } }
}

const manifest = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as PackageManifest
const codexManifest = JSON.parse(
  readFileSync(new URL('../.codex-plugin/plugin.json', import.meta.url), 'utf8'),
) as { name?: string; version?: string }

describe('runtime native dependency contract', () => {
  it('uses the DSH host sharp instead of installing a second libvips copy', () => {
    expect(manifest.dependencies?.sharp).toBeUndefined()
    expect(manifest.peerDependencies?.sharp).toBe('^0.35.4')
    expect(manifest.devDependencies?.sharp).toBe('^0.35.4')
  })

  it('keeps the runtime CPA-only and ships both plugin manifests', () => {
    expect(manifest.peerDependencies?.['@LiuRJ99/dsh-cpa-plugin']).toBe('>=0.4.0 <0.5.0')
    expect(manifest.peerDependencies?.['@deepseek-ai/dsh-client-locale']).toBe('>=0.1.2-rc.1 <0.2.0')
    const names = Object.keys({ ...manifest.dependencies, ...manifest.devDependencies }).join(' ')
    expect(names).not.toMatch(/google|openai|seedream|dashscope|credential/i)
    expect(manifest.dsh?.bundle?.patch).toBe('./cordis.patch.yml')
    expect(manifest.dsh?.client?.inject).toContain('@deepseek-ai/dsh-client-locale')
    expect(manifest.files).toContain('docs/CPA-ONLY-OPTION-A.md')
    expect(manifest.files).toContain('docs/inspiration-data-mapping.md')
    expect(manifest.files).toContain('src/inspiration/data/awesome-gpt-image-2.json')
    expect(manifest.files).toContain('src/inspiration/data/awesome-gpt-image-2.version.txt')
    expect(manifest.scripts).toMatchObject({ typecheck: expect.any(String), test: expect.any(String), build: expect.any(String), 'pack:check': expect.any(String), 'pack:artifact': expect.any(String) })
    expect(codexManifest).toMatchObject({ name: 'dsh-image-gen', version: '0.5.0' })
  })
})
