import { describe, it, expect } from 'vitest'
import { embed } from '../src/embeddings.js'
import { EMBEDDING } from '../src/constants.js'

// The embeddings endpoint is stubbed deterministically in test/setup.ts, so this
// checks the shape/wiring (dimension) rather than semantic quality (validated live).
describe('embed', () => {
  it('returns a vector of the configured dimension', async () => {
    const v = await embed('hello world')
    expect(v).toHaveLength(EMBEDDING.dim)
    expect(typeof v[0]).toBe('number')
  })

  it('is deterministic for the same text', async () => {
    const a = await embed('same text')
    const b = await embed('same text')
    expect(a).toEqual(b)
  })
})
