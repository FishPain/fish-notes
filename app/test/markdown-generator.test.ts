import { describe, it, expect } from 'vitest'
import { makeMarkdownGenerator } from '../src/ai/markdown-generator.js'

describe('makeMarkdownGenerator', () => {
  it('returns a callable for openai', () => {
    const gen = makeMarkdownGenerator({ provider: 'openai', model: 'gpt-5-mini', openaiApiKey: 'k', openaiBaseURL: 'http://x' })
    expect(typeof gen).toBe('function')
  })

  it('passes instruction + sources (with urls) to the model and returns its text', async () => {
    let seen = ''
    const fake = async (prompt: string) => {
      seen = prompt
      return '## Overview\nPods share a flat network. [k8s](https://k8s.io)'
    }
    const gen = makeMarkdownGenerator({ provider: 'openai', model: 'x', openaiApiKey: 'k', openaiBaseURL: 'http://x' }, fake)
    const md = await gen('brief on Kubernetes', [{ id: 1, content: 'flat pod network', url: 'https://k8s.io' }], '')
    expect(seen).toContain('flat pod network')
    expect(seen).toContain('https://k8s.io')
    expect(md).toContain('## Overview')
  })

  it('inline mode: forbids questions and tells the model to match surrounding formatting', async () => {
    let seen = ''
    const fake = async (prompt: string) => {
      seen = prompt
      return 'ok'
    }
    const gen = makeMarkdownGenerator({ provider: 'openai', model: 'x', openaiApiKey: 'k', openaiBaseURL: 'http://x' }, fake)
    const ctx = 'TEXT BEFORE THE INSERTION POINT:\nThe API returns JSON and\n\nTEXT AFTER THE INSERTION POINT:\n(end of document)'
    await gen('continue this', [], ctx)
    expect(seen).toContain('NEVER address the user or ask questions')
    expect(seen).toContain('CONTINUE AS PROSE')
    expect(seen).toContain('The API returns JSON and')
  })
})
