import { describe, it, expect } from 'vitest'
import { openDb } from '../src/db.js'
import { insertCapture } from '../src/capture.service.js'
import { createCanvas, saveDoc, getCanvas } from '../src/canvas.service.js'
import { collate } from '../src/collate.service.js'
import { RawSegment, Segment } from '../src/types.js'

describe('collate', () => {
  it('preserves user-locked segments, replaces AI segments, drops hallucinated citations', async () => {
    const db = openDb(':memory:')
    const c1 = await insertCapture(db, { content: 'Kubernetes networking uses a flat pod network', source: { type: 'web' } })
    await insertCapture(db, { content: 'unrelated sourdough note', source: { type: 'web' } })

    const canvasId = createCanvas(db, 'Kubernetes')
    const locked: Segment = { id: 'u1', heading: 'Decision', text: 'We use the event bus', origin: 'user', citations: [] }
    const oldAi: Segment = { id: 'a1', heading: 'Old', text: 'stale ai text', origin: 'ai', citations: [999] }
    saveDoc(db, canvasId, [locked, oldAi])

    const generateSegments = async (): Promise<RawSegment[]> => [
      { heading: 'Overview', text: 'Pods share a flat network', citations: [c1, 999] }
    ]

    const doc = await collate(db, canvasId, generateSegments)

    const user = doc.find((s) => s.id === 'u1')!
    expect(user.text).toBe('We use the event bus')
    expect(user.origin).toBe('user')
    expect(doc.find((s) => s.id === 'a1')).toBeUndefined()
    const ai = doc.find((s) => s.origin === 'ai')!
    expect(ai.heading).toBe('Overview')
    expect(ai.citations).toEqual([c1])
    expect(getCanvas(db, canvasId)!.doc.length).toBe(doc.length)
    expect(getCanvas(db, canvasId)!.collatedAt).not.toBe('')
    db.close()
  })
})
