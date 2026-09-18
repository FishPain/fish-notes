import { describe, it, expect } from 'vitest'
import { openDb } from '../src/db.js'
import { buildServer } from '../src/server.js'

const TOKEN = 'test-token'
const makeServer = () => {
  const db = openDb(':memory:')
  const app = buildServer(db, async () => 'stub answer', TOKEN)
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

  it('a failing async handler yields 500, not a hang', async () => {
    const db = openDb(':memory:')
    const app = buildServer(
      db,
      async () => {
        throw new Error('boom')
      },
      TOKEN
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
