import { describe, it, expect } from 'vitest'
import { proxyPost } from '../src/ai/proxy.js'

describe('proxyPost', () => {
  it('retries on 429 (honouring Retry-After) then returns the ok response', async () => {
    const real = globalThis.fetch
    let calls = 0
    globalThis.fetch = (async () => {
      calls++
      if (calls === 1) {
        return {
          ok: false,
          status: 429,
          headers: { get: (k: string) => (k === 'retry-after' ? '0.001' : null) },
          text: async () => 'rate limited'
        }
      }
      return { ok: true, json: async () => ({ ok: true }) }
    }) as unknown as typeof fetch

    const res = await proxyPost('/x', { a: 1 })
    globalThis.fetch = real
    expect(calls).toBe(2)
    expect(res.ok).toBe(true)
  })

  it('throws with status + body on a non-retryable error', async () => {
    const real = globalThis.fetch
    globalThis.fetch = (async () => ({
      ok: false,
      status: 400,
      headers: { get: () => null },
      text: async () => 'bad'
    })) as unknown as typeof fetch
    await expect(proxyPost('/x', {})).rejects.toThrow(/proxy \/x 400: bad/)
    globalThis.fetch = real
  })
})
