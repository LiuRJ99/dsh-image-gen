import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { IMAGE_SETTINGS_ENTRY_ID } from '../src/shared.js'

it('addresses the settings entry installed by the bundle patch', () => {
  const patch = readFileSync(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
  expect(patch).toMatch(new RegExp(`id: ${IMAGE_SETTINGS_ENTRY_ID}\\s`))
})
