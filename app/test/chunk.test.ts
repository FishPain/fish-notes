import { describe, it, expect } from 'vitest'
import { chunkText } from '../src/chunk.js'

describe('chunkText', () => {
  it('keeps short text as a single chunk', () => {
    expect(chunkText('hello world')).toEqual(['hello world'])
  })

  it('packs paragraphs into multiple chunks under the size budget', () => {
    const para = 'w'.repeat(2500)
    const chunks = chunkText([para, para, para].join('\n\n'))
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.every((c) => c.length <= 3000 + 200)).toBe(true)
  })

  it('hard-splits a single oversized paragraph', () => {
    const chunks = chunkText('y'.repeat(7000))
    expect(chunks.length).toBeGreaterThanOrEqual(3)
  })
})
