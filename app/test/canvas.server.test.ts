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
  it('creates a canvas, lists it, collates it', async () => {
    const server = makeServer()
    const { port } = server.address() as { port: number }
    const base = `http://localhost:${port}`
    const headers = { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` }

    const created = await (
      await fetch(`${base}/canvas`, { method: 'POST', headers, body: JSON.stringify({ title: 'New Agent' }) })
    ).json()
    expect(created.id).toBeGreaterThan(0)

    const list = (await (await fetch(`${base}/canvas`, { headers })).json()) as { title: string }[]
    expect(list[0].title).toBe('New Agent')

    const collated = (await (
      await fetch(`${base}/canvas/${created.id}/collate`, { method: 'POST', headers })
    ).json()) as { doc: { heading: string; origin: string }[] }
    expect(collated.doc[0].heading).toBe('H')
    expect(collated.doc[0].origin).toBe('ai')

    server.close()
  })
})
