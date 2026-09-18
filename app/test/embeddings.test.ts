import { describe, it, expect } from 'vitest'
import { embed } from '../src/embeddings.js'

describe('embed', () => {
  it('returns a normalized 384-dim vector', async () => {
    const v = await embed('hello world')
    expect(v).toHaveLength(384)
    const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0))
    expect(norm).toBeCloseTo(1, 2)
  })

  it('related text scores higher than unrelated', async () => {
    const dot = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i], 0)
    const cat = await embed('a fluffy domestic cat')
    const kitten = await embed('a small kitten')
    const finance = await embed('quarterly interest rate policy')
    expect(dot(cat, kitten)).toBeGreaterThan(dot(cat, finance))
  })
})
