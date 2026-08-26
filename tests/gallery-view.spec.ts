import { describe, expect, it } from 'vitest'
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import {
  countByEngine,
  extractAspectRatio,
  formatBytes,
  formatDate,
  formatResolution,
  processGalleryItems,
  type GalleryItem,
} from '../src/client/gallery-store.js'

const attachment = (overrides: Partial<ImageAttachmentRef> = {}): ImageAttachmentRef => ({
  attachmentId: 'sha256:gallery-view-test',
  mediaType: 'image/png',
  bytes: 4,
  width: 1,
  height: 1,
  ...overrides,
})

function item(overrides: Partial<GalleryItem> = {}): GalleryItem {
  return {
    id: 'id',
    attachment: attachment(),
    prompt: '',
    engine: 'gpt',
    model: 'gpt-image-2',
    createdAt: 0,
    ...overrides,
  }
}

describe('processGalleryItems (sort + filter pipeline)', () => {
  const items = [
    item({ id: 'b', prompt: 'banana', engine: 'gpt', createdAt: 200, attachment: attachment({ bytes: 3000 }) }),
    item({ id: 'a', prompt: 'Apple', engine: 'gemini', createdAt: 100, attachment: attachment({ bytes: 500 }) }),
    item({ id: 'c', prompt: 'Cherry', engine: 'unknown', createdAt: 300, attachment: attachment({ bytes: 1000 }) }),
  ]

  it('sorts by time descending by default (newest first)', () => {
    const result = processGalleryItems(items, { search: '', selectedEngine: 'all', selectedRatio: 'all', sortOption: 'time-desc' })
    expect(result.map((i) => i.id)).toEqual(['c', 'b', 'a'])
  })

  it('sorts by time ascending (oldest first)', () => {
    const result = processGalleryItems(items, { search: '', selectedEngine: 'all', selectedRatio: 'all', sortOption: 'time-asc' })
    expect(result.map((i) => i.id)).toEqual(['a', 'b', 'c'])
  })

  it('sorts prompt A→Z and Z→A', () => {
    const asc = processGalleryItems(items, { search: '', selectedEngine: 'all', selectedRatio: 'all', sortOption: 'prompt-asc' })
    expect(asc.map((i) => i.id)).toEqual(['a', 'b', 'c'])
    const desc = processGalleryItems(items, { search: '', selectedEngine: 'all', selectedRatio: 'all', sortOption: 'prompt-desc' })
    expect(desc.map((i) => i.id)).toEqual(['c', 'b', 'a'])
  })

  it('sorts by file size descending', () => {
    const result = processGalleryItems(items, { search: '', selectedEngine: 'all', selectedRatio: 'all', sortOption: 'size-desc' })
    expect(result.map((i) => i.id)).toEqual(['b', 'c', 'a'])
  })

  it('filters by engine and still sorts', () => {
    const result = processGalleryItems(items, { search: '', selectedEngine: 'gemini', selectedRatio: 'all', sortOption: 'time-desc' })
    expect(result.map((i) => i.id)).toEqual(['a'])
  })

  it('filters by prompt keyword case-insensitively', () => {
    const result = processGalleryItems(items, { search: 'app', selectedEngine: 'all', selectedRatio: 'all', sortOption: 'time-desc' })
    expect(result.map((i) => i.id)).toEqual(['a'])
  })

  it('filters by aspect ratio', () => {
    const wide = item({ id: 'w', aspectRatio: '16:9', attachment: attachment({ width: 1600, height: 900 }) })
    const square = item({ id: 's', aspectRatio: '1:1', attachment: attachment({ width: 512, height: 512 }) })
    const result = processGalleryItems([wide, square], { search: '', selectedEngine: 'all', selectedRatio: '16:9', sortOption: 'time-desc' })
    expect(result.map((i) => i.id)).toEqual(['w'])
  })

  it('does not mutate the input array', () => {
    const snapshot = [...items]
    processGalleryItems(items, { search: '', selectedEngine: 'all', selectedRatio: 'all', sortOption: 'time-asc' })
    expect(items).toEqual(snapshot)
  })
})

describe('extractAspectRatio', () => {
  it('extracts from aspectRatio string with normalization', () => {
    expect(extractAspectRatio(item({ aspectRatio: '16:9' }))).toBe('16:9')
  })

  it('normalizes non-reduced ratios', () => {
    expect(extractAspectRatio(item({ aspectRatio: '1024:576' }))).toBe('16:9')
  })

  it('falls back to attachment width/height', () => {
    expect(extractAspectRatio(item({ attachment: attachment({ width: 800, height: 600 }) }))).toBe('4:3')
  })

  it('reads a colon ratio out of the output string', () => {
    expect(extractAspectRatio(item({ output: '16:9, 2K, 1536x864' }))).toBe('16:9')
  })

  it('returns "all" when ratio is unknown', () => {
    const bare = item({ attachment: attachment({ width: 0, height: 0 }) })
    expect(extractAspectRatio(bare)).toBe('all')
  })
})

describe('formatBytes', () => {
  it('formats bytes, KB, MB and GB', () => {
    expect(formatBytes(12)).toBe('12 B')
    expect(formatBytes(340 * 1024)).toBe('340 KB')
    expect(formatBytes(Math.round(1.4 * 1024 * 1024))).toBe('1.4 MB')
    expect(formatBytes(2.5 * 1024 * 1024 * 1024)).toBe('2.5 GB')
  })

  it('falls back to a dash for missing or invalid input', () => {
    expect(formatBytes(undefined)).toBe('—')
    expect(formatBytes(null)).toBe('—')
    expect(formatBytes(-1)).toBe('—')
  })
})

describe('formatResolution', () => {
  it('formats width×height', () => {
    expect(formatResolution(item({ attachment: attachment({ width: 1024, height: 1024 }) }))).toBe('1024×1024')
  })

  it('falls back to the aspect ratio when dimensions are missing', () => {
    expect(formatResolution(item({ aspectRatio: '16:9', attachment: attachment({ width: 0, height: 0 }) }))).toBe('16:9')
  })

  it('returns an empty string when neither is available', () => {
    expect(formatResolution(item({ attachment: attachment({ width: 0, height: 0 }) }))).toBe('')
  })
})

describe('formatDate', () => {
  it('formats a timestamp as YYYY-MM-DD HH:mm', () => {
    expect(formatDate(new Date(2025, 4, 18, 14, 30).getTime())).toBe('2025-05-18 14:30')
  })

  it('falls back to a dash for invalid input', () => {
    expect(formatDate(Number.NaN)).toBe('—')
  })
})

describe('countByEngine', () => {
  const items = [
    item({ engine: 'gpt' }),
    item({ engine: 'gpt' }),
    item({ engine: 'gemini' }),
    item({ engine: 'unknown' }),
  ]

  it('counts per-engine buckets', () => {
    expect(countByEngine(items, 'gpt')).toBe(2)
    expect(countByEngine(items, 'gemini')).toBe(1)
    expect(countByEngine(items, 'unknown')).toBe(1)
  })

  it('counts the "all" bucket as the full list length', () => {
    expect(countByEngine(items, 'all')).toBe(4)
  })
})
