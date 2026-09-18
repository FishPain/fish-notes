import { describe, it, expect } from 'vitest'
import { openDb } from '../src/db.js'
import { buildServer } from '../src/server.js'

const TOKEN = 'test-token'
const makeServer = () => {
  const db = openDb(':memory:')
  const app = buildServer(db, async () => 'stub', TOKEN, async () => '## Draft\ntext [r](https://e.com)')
  return app.listen(0)
}

describe('canvas routes', () => {
  it('creates, saves doc, drafts (markdown), completes (markdown)', async () => {
    const server = makeServer()
    const { port } = server.address() as { port: number }
    const base = `http://localhost:${port}`
    const headers = { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` }

    const created = await (await fetch(`${base}/canvas`, { method: 'POST', headers, body: JSON.stringify({ title: 'A' }) })).json()
    const doc = { type: 'doc', content: [] }
    expect((await fetch(`${base}/canvas/${created.id}`, { method: 'PATCH', headers, body: JSON.stringify({ doc }) })).status).toBe(200)

    const draft = await (await fetch(`${base}/canvas/${created.id}/draft`, { method: 'POST', headers })).json()
    expect(draft.markdown).toContain('## Draft')

    const done = await (await fetch(`${base}/canvas/${created.id}/complete`, { method: 'POST', headers, body: JSON.stringify({ prompt: 'x', doc: 'ctx' }) })).json()
    expect(done.markdown).toContain('## Draft')

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
