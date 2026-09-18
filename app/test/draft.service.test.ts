import { describe, it, expect } from 'vitest'
import { openDb } from '../src/db.js'
import { insertCapture } from '../src/capture.service.js'
import { createCanvas, getCanvas } from '../src/canvas.service.js'
import { draftFromSources } from '../src/draft.service.js'
import { RawSegment } from '../src/types.js'

describe('draftFromSources', () => {
  it('returns grounded sections with hallucinated citations dropped, and stamps collatedAt', async () => {
    const db = openDb(':memory:')
    const c1 = await insertCapture(db, { content: 'Kubernetes uses a flat pod network', source: { type: 'web' } })
    const canvasId = createCanvas(db, 'Kubernetes')

    const generateSegments = async (): Promise<RawSegment[]> => [
      { heading: 'Overview', text: 'Pods share a flat network', citations: [c1, 999] }
    ]

    const sections = await draftFromSources(db, canvasId, generateSegments)
    expect(sections[0].heading).toBe('Overview')
    expect(sections[0].citations).toEqual([c1])
    expect(getCanvas(db, canvasId)!.collatedAt).not.toBe('')
    db.close()
  })
})
