import { describe, it, expect } from 'vitest'
import { openDb } from '../src/db.js'
import { insertCapture } from '../src/capture.service.js'
import { ask } from '../src/ask.service.js'

describe('ask.service', () => {
  it('retrieves relevant captures, grounds the prompt, returns citations', async () => {
    const db = openDb(':memory:')
    await insertCapture(db, { content: 'The deploy script runs migrations before starting the server', source: { type: 'web' } })
    await insertCapture(db, { content: 'Cats sleep 16 hours a day', source: { type: 'web' } })

    let prompt = ''
    const generate = async (p: string) => {
      prompt = p
      return 'Migrations run first.'
    }

    const result = await ask(db, 'what happens during deploy?', generate, 3)
    expect(prompt).toContain('migrations')
    expect(result.answer).toBe('Migrations run first.')
    expect(result.citations.length).toBeGreaterThan(0)
    expect(result.citations[0].content).toMatch(/deploy|migrations/)
    db.close()
  })
})
