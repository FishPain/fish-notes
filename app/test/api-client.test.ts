import { describe, it, expect } from 'vitest'
import { makeApiClient } from '../renderer/api-client.js'

describe('makeApiClient', () => {
  it('sends the token and parses JSON for GET', async () => {
    const calls: { url: string; headers: Record<string, string> }[] = []
    const fakeFetch = (async (url: string, init: { headers: Record<string, string> }) => {
      calls.push({ url, headers: init.headers })
      return { ok: true, json: async () => [{ id: 1 }] }
    }) as unknown as typeof fetch
    const api = makeApiClient({ baseUrl: 'http://x', token: 'T' }, fakeFetch)
    const rows = await api.request('/capture')
    expect(calls[0].url).toBe('http://x/capture')
    expect(calls[0].headers.authorization).toBe('Bearer T')
    expect(rows).toEqual([{ id: 1 }])
  })

  it('throws on non-ok', async () => {
    const fakeFetch = (async () => ({ ok: false, status: 500 })) as unknown as typeof fetch
    const api = makeApiClient({ baseUrl: 'http://x', token: 'T' }, fakeFetch)
    await expect(api.request('/capture')).rejects.toThrow()
  })
})
