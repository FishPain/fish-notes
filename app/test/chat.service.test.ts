import { describe, it, expect } from 'vitest'
import { openDb } from '../src/db.js'
import { insertCapture } from '../src/capture.service.js'
import { chatAnswer } from '../src/chat.service.js'

describe('chat.service', () => {
  it('grounds the latest turn in retrieved captures and includes prior turns in the prompt', async () => {
    const db = openDb(':memory:')
    await insertCapture(db, { content: 'Kubernetes pods share a flat network', source: { type: 'web' } })
    let seen = ''
    const gen = async (p: string) => {
      seen = p
      return 'answer'
    }
    const res = await chatAnswer(
      db,
      [
        { role: 'user', content: 'tell me about kubernetes networking' },
        { role: 'assistant', content: 'Pods share a flat network.' },
        { role: 'user', content: 'and how do they communicate?' }
      ],
      gen
    )
    expect(res.answer).toBe('answer')
    expect(res.citations.length).toBeGreaterThan(0)
    // prior turns are in the prompt (follow-up context)
    expect(seen).toContain('Pods share a flat network.')
    expect(seen).toContain('and how do they communicate?')
    db.close()
  })

  it('scopes retrieval to the given document (docIds)', async () => {
    const db = openDb(':memory:')
    await insertCapture(db, { content: 'general web note about pods', source: { type: 'web' } })
    await insertCapture(db, {
      content: 'the meeting decided pods use a flat network',
      source: { type: 'upload', name: 'meeting.txt', uploadId: 'U1', chunkIndex: 0 }
    })
    const res = await chatAnswer(db, [{ role: 'user', content: 'pods network' }], async () => 'a', ['U1'])
    expect(res.citations.length).toBeGreaterThan(0)
    expect(res.citations.every((c) => c.source.uploadId === 'U1')).toBe(true)
    db.close()
  })
})
