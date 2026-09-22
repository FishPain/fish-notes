import { describe, it, expect } from 'vitest'
import { openDb } from '../src/db.js'
import { buildServer } from '../src/server.js'

const TOKEN = 'test-token'
const H = { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` }
const makeServer = () => buildServer(openDb(':memory:'), async () => 'ans', TOKEN, async () => 'md').listen(0)

describe('upload', () => {
  it('chunks + stores an uploaded document, then deletes it by uploadId', async () => {
    const server = makeServer()
    const { port } = server.address() as { port: number }
    const base = `http://localhost:${port}`

    const text = Array.from({ length: 5 }, (_, i) => `paragraph ${i} ${'w'.repeat(2500)}`).join('\n\n')
    const up = (await (
      await fetch(`${base}/capture/upload`, { method: 'POST', headers: H, body: JSON.stringify({ name: 'notes.txt', text }) })
    ).json()) as { uploadId: string; chunks: number }
    expect(up.chunks).toBeGreaterThan(1)

    const all = (await (await fetch(`${base}/capture`, { headers: H })).json()) as {
      source: { type: string; uploadId?: string; name?: string }
    }[]
    expect(all).toHaveLength(up.chunks)
    expect(all[0].source.type).toBe('upload')
    expect(all[0].source.name).toBe('notes.txt')

    const del = await fetch(`${base}/capture/upload/${up.uploadId}`, { method: 'DELETE', headers: H })
    expect(del.status).toBe(204)
    const after = (await (await fetch(`${base}/capture`, { headers: H })).json()) as unknown[]
    expect(after).toHaveLength(0)

    server.close()
  })
})
