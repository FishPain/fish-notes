import { describe, it, expect } from 'vitest'
import { embed } from '../src/ai/embeddings.js'
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

  it('truncates over-long input before sending (avoids the 8192-token cap)', async () => {
    const real = globalThis.fetch
    let sentLen = 0
    globalThis.fetch = (async (_url: unknown, init: { body: string }) => {
      sentLen = JSON.parse(init.body).input.length
      return { ok: true, json: async () => ({ data: [{ embedding: [0] }] }) }
    }) as unknown as typeof fetch
    await embed('x'.repeat(50000))
    globalThis.fetch = real
    expect(sentLen).toBeLessThanOrEqual(8000)
  })
})
