import { describe, it, expect } from 'vitest'
import { openDb } from '../src/db.js'
import { insertCapture } from '../src/capture.service.js'
import { createCanvas } from '../src/canvas.service.js'
import { draftFromSources, completeInline } from '../src/draft.service.js'
import { Source } from '../src/ai/markdown-generator.js'

describe('draft.service', () => {
  it('draftFromSources returns markdown grounded in the note sources', async () => {
    const db = openDb(':memory:')
    await insertCapture(db, { content: 'Kubernetes uses a flat pod network', source: { type: 'web', url: 'https://k8s.io' } })
    const id = createCanvas(db, 'Kubernetes')
    const gen = async (instruction: string, sources: Source[]) => `# ${instruction}\n${sources.length} sources`
    const md = await draftFromSources(db, id, gen)
    expect(md).toContain('#')
    db.close()
  })

  it('completeInline passes the prompt + doc context to the generator', async () => {
    const db = openDb(':memory:')
    await insertCapture(db, { content: 'pods share a network', source: { type: 'web' } })
    const id = createCanvas(db, 'K')
    let seenInstruction = ''
    let seenCtx = ''
    const gen = async (instruction: string, _s: Source[], ctx: string) => {
      seenInstruction = instruction
      seenCtx = ctx
      return 'result md'
    }
    const md = await completeInline(db, id, 'summarise open questions', 'my current notes', gen)
    expect(seenInstruction).toContain('summarise open questions')
    expect(seenCtx).toBe('my current notes')
    expect(md).toBe('result md')
    db.close()
  })
})
