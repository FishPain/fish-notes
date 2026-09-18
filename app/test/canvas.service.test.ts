import { describe, it, expect } from 'vitest'
import { openDb } from '../src/db.js'
import { createCanvas, getCanvas, listCanvases, saveDoc } from '../src/canvas.service.js'

describe('canvas.service', () => {
  it('creates a canvas with an empty doc and reads title/description back', () => {
    const db = openDb(':memory:')
    const id = createCanvas(db, 'New Agent', 'internal systems')
    expect(listCanvases(db).map((c) => c.title)).toContain('New Agent')
    const c = getCanvas(db, id)!
    expect(c.title).toBe('New Agent')
    expect(c.description).toBe('internal systems')
    expect(c.doc).toEqual({ type: 'doc', content: [] })
    db.close()
  })

  it('saves an arbitrary doc (opaque JSON) and reads it back', () => {
    const db = openDb(':memory:')
    const id = createCanvas(db, 'C')
    const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hi' }] }] }
    saveDoc(db, id, doc)
    expect(getCanvas(db, id)!.doc).toEqual(doc)
    db.close()
  })
})
