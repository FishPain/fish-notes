import { describe, it, expect } from 'vitest'
import { openDb } from '../src/db.js'
import { buildServer } from '../src/server.js'

const TOKEN = 'test-token'
const makeServer = () => {
  const db = openDb(':memory:')
  const app = buildServer(db, async () => 'stub', TOKEN, async () => [{ heading: 'H', text: 'T', citations: [] }])
  return app.listen(0)
}

describe('canvas routes', () => {
  it('creates, saves the doc, and drafts', async () => {
    const server = makeServer()
    const { port } = server.address() as { port: number }
    const base = `http://localhost:${port}`
    const headers = { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` }

    const created = await (await fetch(`${base}/canvas`, { method: 'POST', headers, body: JSON.stringify({ title: 'New Agent' }) })).json()
    expect(created.id).toBeGreaterThan(0)

    const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'my note' }] }] }
    const saved = await fetch(`${base}/canvas/${created.id}`, { method: 'PATCH', headers, body: JSON.stringify({ doc }) })
    expect(saved.status).toBe(200)
    const got = await (await fetch(`${base}/canvas/${created.id}`, { headers })).json()
    expect(got.doc).toEqual(doc)

    const draft = await (await fetch(`${base}/canvas/${created.id}/draft`, { method: 'POST', headers })).json()
    expect(draft.sections[0].heading).toBe('H')

    server.close()
  })

  it('returns 404 for a missing canvas', async () => {
    const server = makeServer()
    const { port } = server.address() as { port: number }
    const res = await fetch(`http://localhost:${port}/canvas/9999`, { headers: { authorization: `Bearer ${TOKEN}` } })
    expect(res.status).toBe(404)
    server.close()
  })
})
