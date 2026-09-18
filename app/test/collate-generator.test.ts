import { describe, it, expect } from 'vitest'
import { makeSegmentGenerator } from '../src/collate-generator.js'

describe('makeSegmentGenerator', () => {
  it('returns a callable for the ollama provider', () => {
    const gen = makeSegmentGenerator({ provider: 'ollama', model: 'llama3.1', ollamaBaseURL: 'http://localhost:11434/api' })
    expect(typeof gen).toBe('function')
  })

  it('parses a JSON array of segments from the model text', async () => {
    const fakeText = async () =>
      '```json\n[{"heading":"H","text":"T","citations":[1,2]}]\n```'
    const gen = makeSegmentGenerator(
      { provider: 'ollama', model: 'x', ollamaBaseURL: 'http://localhost:11434/api' },
      fakeText
    )
    const segs = await gen('topic', [{ id: 1, content: 'c' }], [])
    expect(segs).toEqual([{ heading: 'H', text: 'T', citations: [1, 2] }])
  })

  it('returns [] when the model text is not valid JSON', async () => {
    const gen = makeSegmentGenerator(
      { provider: 'ollama', model: 'x', ollamaBaseURL: 'http://localhost:11434/api' },
      async () => 'sorry I cannot'
    )
    expect(await gen('t', [], [])).toEqual([])
  })
})
