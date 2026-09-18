import { beforeAll, afterAll } from 'vitest'
import { EMBEDDING } from '../src/constants.js'

// Embeddings now go through the proxy API. In tests we stub ONLY that endpoint
// with a deterministic pseudo-embedding (same text -> same vector), and pass every
// other fetch (e.g. server tests hitting the local Express app) through untouched.
const realFetch = globalThis.fetch

const hash = (s: string): number => {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

const pseudoEmbed = (text: string): number[] => {
  let seed = hash(text)
  const v: number[] = []
  for (let i = 0; i < EMBEDDING.dim; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    v.push((seed / 0x7fffffff) * 2 - 1)
  }
  return v
}

beforeAll(() => {
  globalThis.fetch = (async (url: unknown, init?: { body?: string }) => {
    if (String(url).includes('/embeddings')) {
      const body = JSON.parse(init?.body ?? '{}')
      const inputs = Array.isArray(body.input) ? body.input : [body.input]
      return { ok: true, json: async () => ({ data: inputs.map((t: string) => ({ embedding: pseudoEmbed(String(t)) })) }) }
    }
    return realFetch(url as Parameters<typeof fetch>[0], init as Parameters<typeof fetch>[1])
  }) as typeof fetch
})

afterAll(() => {
  globalThis.fetch = realFetch
})
