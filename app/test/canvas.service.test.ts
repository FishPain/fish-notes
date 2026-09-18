import { describe, it, expect } from 'vitest'
import { openDb } from '../src/db.js'
import { createCanvas, getCanvas, listCanvases, saveDoc, updateSegment } from '../src/canvas.service.js'
import { Segment } from '../src/types.js'

const seg = (over: Partial<Segment>): Segment => ({
  id: 'x',
  heading: '',
  text: 't',
  origin: 'ai',
  citations: [],
  ...over
})

describe('canvas.service', () => {
  it('creates, lists, and reads a canvas with title, description, and an empty doc', () => {
    const db = openDb(':memory:')
    const id = createCanvas(db, 'New Agent', 'internal systems for the agent build')
    expect(listCanvases(db).map((c) => c.title)).toContain('New Agent')
    const c = getCanvas(db, id)!
    expect(c.title).toBe('New Agent')
    expect(c.description).toBe('internal systems for the agent build')
    expect(c.doc).toEqual([])
    db.close()
  })

  it('saves a doc and reads it back', () => {
    const db = openDb(':memory:')
    const id = createCanvas(db, 'C')
    saveDoc(db, id, [seg({ id: 's1', text: 'hello' })])
    expect(getCanvas(db, id)!.doc[0].text).toBe('hello')
    db.close()
  })

  it('updateSegment locks the segment as user-origin with new text', () => {
    const db = openDb(':memory:')
    const id = createCanvas(db, 'C')
    saveDoc(db, id, [seg({ id: 's1', origin: 'ai', text: 'ai text' })])
    updateSegment(db, id, 's1', 'my edit')
    const s = getCanvas(db, id)!.doc[0]
    expect(s.origin).toBe('user')
    expect(s.text).toBe('my edit')
    db.close()
  })
})
