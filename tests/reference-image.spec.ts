import type { ImageAttachmentRef, StoredImageAttachment } from '@deepseek-ai/dsh-attachment'
import { describe, expect, it, vi } from 'vitest'
import { resolveReferenceImages } from '../src/reference-image.js'

const FIRST_ID = 'sha256:' + '1'.repeat(64)
const SECOND_ID = 'sha256:' + '2'.repeat(64)

function imageRef(attachmentId: string, mediaType: ImageAttachmentRef['mediaType'] = 'image/png'): ImageAttachmentRef {
  return {
    attachmentId,
    mediaType,
    bytes: 3,
    width: 1,
    height: 1,
    name: 'reference',
  }
}

describe('resolveReferenceImages', () => {
  it('uses all images from the newest human message in upload order', async () => {
    const first = imageRef(FIRST_ID)
    const second = imageRef(SECOND_ID, 'image/jpeg')
    const readImage = vi.fn(async (ref: ImageAttachmentRef): Promise<StoredImageAttachment> => ({
      ref,
      data: ref.attachmentId === FIRST_ID ? new Uint8Array([1, 2, 3]) : new Uint8Array([4, 5, 6]),
    }))

    const images = await resolveReferenceImages({
      agent: {
        session: {
          deriveMessages: () => [
            { source: { kind: 'user' }, content: [{ type: 'text', text: 'old' }] },
            { source: { kind: 'user' }, content: [{ type: 'image', attachment: first }, { type: 'image', attachment: second }] },
          ],
        },
      },
      attachments: { readImage },
      signal: new AbortController().signal,
    })

    expect(readImage.mock.calls.map(([ref]) => ref.attachmentId)).toEqual([FIRST_ID, SECOND_ID])
    expect(images).toEqual([
      { data: new Uint8Array([1, 2, 3]), mediaType: 'image/png' },
      { data: new Uint8Array([4, 5, 6]), mediaType: 'image/jpeg' },
    ])
  })

  it('honors explicit attachment ids in caller order and accepts bare SHA-256 ids', async () => {
    const first = imageRef(FIRST_ID)
    const second = imageRef(SECOND_ID)
    const readImage = vi.fn(async (ref: ImageAttachmentRef): Promise<StoredImageAttachment> => ({ ref, data: new Uint8Array([1]) }))

    const images = await resolveReferenceImages({
      agent: {
        session: {
          deriveMessages: () => [{ source: { kind: 'user' }, content: [{ type: 'image', attachment: first }, { type: 'image', attachment: second }] }],
        },
      },
      attachments: { readImage },
      sourceAttachmentIds: ['2'.repeat(64), FIRST_ID],
      signal: new AbortController().signal,
    })

    expect(readImage.mock.calls.map(([ref]) => ref.attachmentId)).toEqual([SECOND_ID, FIRST_ID])
    expect(images).toHaveLength(2)
  })

  it('rejects missing images and oversized attachments before edit dispatch', async () => {
    const readImage = vi.fn(async (ref: ImageAttachmentRef): Promise<StoredImageAttachment> => ({ ref, data: new Uint8Array([1, 2, 3, 4]) }))
    const base = {
      agent: {
        session: {
          deriveMessages: () => [{ source: { kind: 'user' }, content: [{ type: 'image', attachment: imageRef(FIRST_ID) }] }],
        },
      },
      attachments: { readImage },
      signal: new AbortController().signal,
    }

    await expect(resolveReferenceImages({ ...base, sourceAttachmentId: 'sha256:' + '9'.repeat(64) })).rejects.toThrow('could not find image attachment')
    await expect(resolveReferenceImages({ ...base, maxBytes: 3 })).rejects.toThrow('source image is too large')
  })
})
