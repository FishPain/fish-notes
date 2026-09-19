import { describe, it, expect } from 'vitest'
import { ocrImage } from '../src/ocr.js'

describe('ocrImage', () => {
  it('sends the image and returns the model transcription (trimmed)', async () => {
    const real = globalThis.fetch
    let sentImage = ''
    globalThis.fetch = (async (_url: unknown, init: { body: string }) => {
      const body = JSON.parse(init.body)
      sentImage = body.messages[0].content.find((p: { type: string }) => p.type === 'image_url').image_url.url
      return { ok: true, json: async () => ({ choices: [{ message: { content: '  hello from the screen  ' } }] }) }
    }) as unknown as typeof fetch

    const text = await ocrImage('QUJD') // base64 of "ABC"
    globalThis.fetch = real

    expect(text).toBe('hello from the screen')
    expect(sentImage).toBe('data:image/png;base64,QUJD')
  })
})
