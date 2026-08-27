import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

type PackageManifest = {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
}

const manifest = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as PackageManifest

describe('runtime native dependency contract', () => {
  it('uses the DSH host sharp instead of installing a second libvips copy', () => {
    expect(manifest.dependencies?.sharp).toBeUndefined()
    expect(manifest.peerDependencies?.sharp).toBe('^0.35.4')
    expect(manifest.devDependencies?.sharp).toBe('^0.35.4')
  })
})
