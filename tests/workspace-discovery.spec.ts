import { mkdir, mkdtemp, readFile, realpath, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  assertWorkspaceAllowed,
  deleteImageByAttachmentIdFromWorkspace,
  deleteImageFromWorkspace,
  getDshWorkspaceRoots,
  getDshWorkspacesFull,
  saveImageToWorkspace,
} from '../src/workspace-save.js'

const originalHome = process.env.HOME
const originalUserProfile = process.env.USERPROFILE

afterEach(() => {
  if (originalHome === undefined) delete process.env.HOME
  else process.env.HOME = originalHome
  if (originalUserProfile === undefined) delete process.env.USERPROFILE
  else process.env.USERPROFILE = originalUserProfile
})

describe('DSH workspace discovery', () => {
  it('reads roots and detailed records from the current workspace storage', async () => {
    const home = await mkdtemp(join(tmpdir(), 'dsh-image-gen-home-'))
    const firstRoot = await mkdtemp(join(tmpdir(), 'dsh-image-gen-root-'))
    const secondRoot = await mkdtemp(join(tmpdir(), 'dsh-image-gen-root-'))
    try {
      process.env.USERPROFILE = home
      process.env.HOME = home
      const storage = join(home, '.dsh', 'storages')
      await mkdir(storage, { recursive: true })
      await writeFile(join(storage, 'workspace.json'), JSON.stringify({
        tables: {
          workspaces: {
            first: { path: `  ${firstRoot} `, title: ' First ', sessionIds: ['s-1', 2, 's-2'] },
            duplicate: { path: firstRoot, title: 'ignored duplicate' },
            second: { path: secondRoot },
            blank: { path: '   ' },
            malformed: { path: 42 },
          },
        },
      }))

      expect(await getDshWorkspaceRoots()).toEqual([firstRoot, secondRoot])
      expect(await getDshWorkspacesFull()).toEqual([
        { workspaceId: 'first', path: firstRoot, title: 'First', sessionIds: ['s-1', 's-2'] },
        { workspaceId: 'duplicate', path: firstRoot, title: 'ignored duplicate', sessionIds: [] },
        { workspaceId: 'second', path: secondRoot, title: 'dsh-image-gen-root-' + secondRoot.split('dsh-image-gen-root-')[1], sessionIds: [] },
      ])
    } finally {
      await rm(home, { recursive: true, force: true })
      await rm(firstRoot, { recursive: true, force: true })
      await rm(secondRoot, { recursive: true, force: true })
    }
  })

  it('treats missing and malformed storage as empty', async () => {
    const home = await mkdtemp(join(tmpdir(), 'dsh-image-gen-home-'))
    try {
      process.env.USERPROFILE = home
      process.env.HOME = home
      expect(await getDshWorkspaceRoots()).toEqual([])
      const storage = join(home, '.dsh', 'storages')
      await mkdir(storage, { recursive: true })
      await writeFile(join(storage, 'workspace.json'), '{not-json')
      expect(await getDshWorkspaceRoots()).toEqual([])
      expect(await getDshWorkspacesFull()).toEqual([])
    } finally {
      await rm(home, { recursive: true, force: true })
    }
  })
})

describe('workspace deletion safety', () => {
  it('requires explicit roots and deletes only generated regular files inside them', async () => {
    const allowed = await mkdtemp(join(tmpdir(), 'dsh-image-gen-allowed-'))
    const outside = await mkdtemp(join(tmpdir(), 'dsh-image-gen-outside-'))
    try {
      const file = join(allowed, 'image-01234567.png')
      await writeFile(file, new Uint8Array([1, 2, 3]))
      expect(await deleteImageFromWorkspace(file)).toBe(false)
      expect(await stat(file)).toBeDefined()
      expect(await deleteImageFromWorkspace(file, [outside])).toBe(false)
      expect(await stat(file)).toBeDefined()
      expect(await deleteImageFromWorkspace(file, [allowed], { allowLegacy: true })).toBe(true)
      await expect(stat(file)).rejects.toThrow()
    } finally {
      await rm(allowed, { recursive: true, force: true })
      await rm(outside, { recursive: true, force: true })
    }
  })

  it('rejects legacy or malformed path-only names', async () => {
    const allowed = await mkdtemp(join(tmpdir(), 'dsh-image-gen-allowed-'))
    try {
      const legacy = join(allowed, 'image-01234567.png')
      const nine = join(allowed, 'image-012345678.png')
      const sixtyThree = join(allowed, `image-${'a'.repeat(63)}.png`)
      await writeFile(legacy, new Uint8Array([1]))
      await writeFile(nine, new Uint8Array([1]))
      await writeFile(sixtyThree, new Uint8Array([1]))
      expect(await deleteImageFromWorkspace(legacy, [allowed])).toBe(false)
      expect(await deleteImageFromWorkspace(nine, [allowed])).toBe(false)
      expect(await deleteImageFromWorkspace(sixtyThree, [allowed])).toBe(false)
      await expect(assertWorkspaceAllowed('.', [allowed])).rejects.toThrow()
    } finally {
      await rm(allowed, { recursive: true, force: true })
    }
  })

  it('rejects non-generated names, directories, symlinks, and paths resolving outside roots', async () => {
    const allowed = await mkdtemp(join(tmpdir(), 'dsh-image-gen-allowed-'))
    const outside = await mkdtemp(join(tmpdir(), 'dsh-image-gen-outside-'))
    try {
      const invalid = join(allowed, 'image-01234567.txt')
      const directory = join(allowed, 'image-abcdef12.png')
      const secret = join(outside, 'secret.txt')
      const directLink = join(allowed, 'image-deadbeef.png')
      const parentLink = join(allowed, 'linked')
      const escapingImage = join(outside, 'image-cafebabe.png')
      await writeFile(invalid, new Uint8Array([1]))
      await mkdir(directory)
      await writeFile(secret, 'keep')
      await writeFile(escapingImage, new Uint8Array([2]))
      await symlink(secret, directLink, 'file')
      await symlink(outside, parentLink, 'dir')

      expect(await deleteImageFromWorkspace(invalid, [allowed])).toBe(false)
      expect(await deleteImageFromWorkspace(directory, [allowed])).toBe(false)
      expect(await deleteImageFromWorkspace(directLink, [allowed])).toBe(false)
      expect(await deleteImageFromWorkspace(join(parentLink, 'image-cafebabe.png'), [allowed])).toBe(false)
      expect(await readFile(secret, 'utf8')).toBe('keep')
      expect(await stat(escapingImage)).toBeDefined()
    } finally {
      await rm(allowed, { recursive: true, force: true })
      await rm(outside, { recursive: true, force: true })
    }
  })

  it('strictly maps a full attachment id to generated files in the requested folder', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-image-gen-root-'))
    const attachmentId = 'sha256:839aeb4316d7dfaca3d5d0c35009402f3d6b72e851ce3e03bc3446ddf819b0b8'
    try {
      const saved = await saveImageToWorkspace({
        workspaceRoot: root,
        folder: 'nested/images',
        attachmentId,
        mediaType: 'image/webp',
        data: new Uint8Array([8, 7, 6]),
      })
      expect(await deleteImageByAttachmentIdFromWorkspace(attachmentId, {
        workspaceRoot: root,
        folder: 'nested/images',
      })).toBe(true)
      await expect(stat(saved)).rejects.toThrow()
      expect(await deleteImageByAttachmentIdFromWorkspace('sha256:1234', {
        workspaceRoot: root,
        folder: 'nested/images',
      })).toBe(false)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('proves candidate and root realpaths before authorizing access', async () => {
    const allowed = await mkdtemp(join(tmpdir(), 'dsh-image-gen-allowed-'))
    const outside = await mkdtemp(join(tmpdir(), 'dsh-image-gen-outside-'))
    try {
      const nested = join(allowed, 'nested')
      await mkdir(nested)
      expect(await assertWorkspaceAllowed(nested, [allowed])).toBe(await realpath(nested))
      await expect(assertWorkspaceAllowed(outside, [allowed])).rejects.toThrow(/not within an allowed DSH workspace/)
      await symlink(outside, join(allowed, 'escape'), 'dir')
      await expect(assertWorkspaceAllowed(join(allowed, 'escape'), [allowed])).rejects.toThrow(/not within an allowed DSH workspace/)
    } finally {
      await rm(allowed, { recursive: true, force: true })
      await rm(outside, { recursive: true, force: true })
    }
  })
})
