import { describe, it, expect } from 'vitest'
import { openDb } from '../src/db.js'
import { insertCapture, getCapture, deleteCapture } from '../src/capture.service.js'

describe('capture.service', () => {
  it('inserts and reads back with parsed source/tags and a capturedAt', async () => {
    const db = openDb(':memory:')
    const id = await insertCapture(db, {
      content: 'mitochondria is the powerhouse of the cell',
      note: 'remember',
      source: { type: 'web', url: 'https://bio.example', anchor: '#:~:text=mitochondria' },
      tags: ['biology']
    })
    const c = getCapture(db, id)!
    expect(c.content).toContain('mitochondria')
    expect(c.source.url).toBe('https://bio.example')
    expect(c.tags).toEqual(['biology'])
    expect(c.capturedAt).toBeTruthy()
    db.close()
  })

  it('deletes a capture and its fts + vec rows', async () => {
    const db = openDb(':memory:')
    const id = await insertCapture(db, { content: 'bye', source: { type: 'web' } })
    deleteCapture(db, id)
    expect(getCapture(db, id)).toBeNull()
    const fts = db.prepare('SELECT count(*) AS c FROM captures_fts WHERE capture_id = ?').get(id) as { c: number }
    const vec = db.prepare('SELECT count(*) AS c FROM vec_captures WHERE capture_id = ?').get(id) as { c: number }
    expect(fts.c).toBe(0)
    expect(vec.c).toBe(0)
    db.close()
  })
})
