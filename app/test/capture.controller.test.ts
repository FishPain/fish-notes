import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { openDb } from '../src/db.js'
import { buildServer } from '../src/server.js'

const TOKEN = 'test-token'
const headers = { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` }

// Stub the proxy OCR call (/chat/completions) to return fixed markdown; delegate
// everything else (local Express server, /embeddings) to the fetch set up in test/setup.ts.
let restoreFetch: () => void
beforeEach(() => {
  const prev = globalThis.fetch
  globalThis.fetch = (async (url: unknown, init?: Parameters<typeof fetch>[1]) => {
    if (String(url).includes('/chat/completions')) {
      return { ok: true, json: async () => ({ choices: [{ message: { content: 'OCR TEXT' } }] }) } as Response
    }
    return prev(url as Parameters<typeof fetch>[0], init)
  }) as typeof fetch
  restoreFetch = () => { globalThis.fetch = prev }
})
afterEach(() => restoreFetch())

const makeServer = () => {
  const db = openDb(':memory:')
  const app = buildServer(db, async () => 'stub', TOKEN, async () => '## Draft')
  return app.listen(0)
}

describe('POST /capture/screen', () => {
  it('stores OCR text with the posted url/appName/windowTitle/note and contextText', async () => {
    const server = makeServer()
    const { port } = server.address() as { port: number }
    const base = `http://localhost:${port}`

    const res = await fetch(`${base}/capture/screen`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        pngBase64: 'QUJD',
        url: 'https://example.com/page',
        appName: 'Google Chrome',
        windowTitle: 'Example Page',
        note: 'why this matters'
      })
    })
    expect(res.status).toBe(201)

    const list = (await (await fetch(`${base}/capture`, { headers })).json()) as Array<{
      content: string; note: string; contextText: string
      source: { type: string; url?: string; appName?: string; windowTitle?: string }
    }>
    const cap = list[0]
    expect(cap.content).toBe('OCR TEXT')
    expect(cap.source).toMatchObject({ type: 'screen', url: 'https://example.com/page', appName: 'Google Chrome', windowTitle: 'Example Page' })
    expect(cap.note).toBe('why this matters')
    expect(cap.contextText).toBe('Google Chrome — Example Page — https://example.com/page')

    server.close()
  })

  it('stores note but leaves contextText empty when no windowTitle is posted', async () => {
    const server = makeServer()
    const { port } = server.address() as { port: number }
    const base = `http://localhost:${port}`

    const res = await fetch(`${base}/capture/screen`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ pngBase64: 'QUJD', note: 'standalone note' })
    })
    expect(res.status).toBe(201)

    const list = (await (await fetch(`${base}/capture`, { headers })).json()) as Array<{
      note: string; contextText: string
    }>
    const cap = list[0]
    expect(cap.note).toBe('standalone note')
    expect(cap.contextText).toBe('')

    server.close()
  })
})
