import { describe, it, expect } from 'vitest'
import { makeGenerate } from '../src/generator.js'

describe('makeGenerate', () => {
  it('returns a callable for the openai provider', () => {
    const gen = makeGenerate({ provider: 'openai', model: 'gpt-5-mini', openaiApiKey: 'k', openaiBaseURL: 'http://localhost:6655/openai/v1' })
    expect(typeof gen).toBe('function')
  })

  it('returns a callable for anthropic with a key', () => {
    const gen = makeGenerate({ provider: 'anthropic', model: 'claude-sonnet-5', anthropicApiKey: 'sk-test' })
    expect(typeof gen).toBe('function')
  })
})
