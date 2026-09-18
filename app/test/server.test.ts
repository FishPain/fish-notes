import { describe, it, expect } from 'vitest'
import { openDb } from '../src/db.js'
import { buildServer } from '../src/server.js'

const TOKEN = 'test-token'
const makeServer = () => {
  const db = openDb(':memory:')
  const app = buildServer(db, async () => 'stub answer', TOKEN, async () => [])
  return app.listen(0)
}

describe('server', () => {
  it('rejects /capture without the token (401)', async () => {
    const server = makeServer()
    const { port } = server.address() as { port: number }
    const res = await fetch(`http://localhost:${port}/capture`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content: 'x', source: { type: 'web' } })
    })
    expect(res.status).toBe(401)
    server.close()
  })

  it('accepts a capture with the token, then finds it via search', async () => {
    const server = makeServer()
    const { port } = server.address() as { port: number }
    const base = `http://localhost:${port}`
    const headers = { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` }
    const cap = await fetch(`${base}/capture`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ content: 'sourdough fermentation tips', source: { type: 'web' } })
    })
    expect(cap.status).toBe(201)
    const search = await fetch(`${base}/search?q=sourdough&mode=keyword`, { headers })
    const results = (await search.json()) as { capture: { content: string } }[]
    expect(results[0].capture.content).toContain('sourdough')
    server.close()
  })

  it('accepts the real capturer payload (screenshot null, source url+anchor) and keeps the source', async () => {
    const server = makeServer()
    const { port } = server.address() as { port: number }
    const base = `http://localhost:${port}`
    const headers = { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` }
    const cap = await fetch(`${base}/capture`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        content: 'the exact sentence I clipped',
        contextText: 'surrounding paragraph',
        note: 'my note',
        source: { type: 'web', url: 'https://intranet.example/doc', anchor: '#:~:text=the%20exact%20sentence' },
        screenshot: null,
        tags: [],
        capturedAt: '2026-09-18T00:00:00.000Z'
      })
    })
    expect(cap.status).toBe(201)
    const all = (await (await fetch(`${base}/capture`, { headers })).json()) as {
      source: { url: string; anchor: string }
    }[]
    expect(all[0].source.url).toBe('https://intranet.example/doc')
    expect(all[0].source.anchor).toBe('#:~:text=the%20exact%20sentence')
    server.close()
  })

  it('answers CORS preflight without a token and sets allow-origin', async () => {
    const server = makeServer()
    const { port } = server.address() as { port: number }
    const res = await fetch(`http://localhost:${port}/capture`, { method: 'OPTIONS' })
    expect(res.status).toBe(204)
    expect(res.headers.get('access-control-allow-origin')).toBe('*')
    expect((res.headers.get('access-control-allow-headers') || '').toLowerCase()).toContain('authorization')
    server.close()
  })

  it('deletes a capture by id', async () => {
    const server = makeServer()
    const { port } = server.address() as { port: number }
    const base = `http://localhost:${port}`
    const headers = { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` }
    const created = await (
      await fetch(`${base}/capture`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ content: 'delete me', source: { type: 'web' } })
      })
    ).json()
    const del = await fetch(`${base}/capture/${created.id}`, { method: 'DELETE', headers })
    expect(del.status).toBe(204)
    const all = (await (await fetch(`${base}/capture`, { headers })).json()) as unknown[]
    expect(all).toHaveLength(0)
    server.close()
  })

  it('a failing async handler yields 500, not a hang', async () => {
    const db = openDb(':memory:')
    const app = buildServer(
      db,
      async () => {
        throw new Error('boom')
      },
      TOKEN,
      async () => []
    )
    const server = app.listen(0)
    const { port } = server.address() as { port: number }
    const res = await fetch(`http://localhost:${port}/ask`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify({ question: 'anything' })
    })
    expect(res.status).toBe(500)
    server.close()
  })
})
