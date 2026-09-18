import { describe, it, expect } from 'vitest'
import { makeGenerate } from '../src/generator.js'

describe('makeGenerate', () => {
  it('returns a callable for ollama', () => {
    const gen = makeGenerate({ provider: 'ollama', model: 'llama3.1', ollamaBaseURL: 'http://localhost:11434/api' })
    expect(typeof gen).toBe('function')
  })

  it('returns a callable for anthropic with a key', () => {
    const gen = makeGenerate({
      provider: 'anthropic',
      model: 'claude-sonnet-5',
      anthropicApiKey: 'sk-test',
      ollamaBaseURL: 'http://localhost:11434/api'
    })
    expect(typeof gen).toBe('function')
  })
})
