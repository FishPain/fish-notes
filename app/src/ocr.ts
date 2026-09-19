import { AI } from './constants.js'

const MAX_RETRIES = 4
const PROMPT =
  'Transcribe all text in this image exactly, preserving line breaks. ' +
  'Output only the transcription; if there is no text, output nothing.'

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

// OCR a PNG (base64, no data-URL prefix) via the OpenAI-compatible proxy's vision
// model. Mirrors embeddings.ts: direct fetch, 429 backoff. Returns the text (may be
// empty if the image has none).
export const ocrImage = async (pngBase64: string): Promise<string> => {
  const body = JSON.stringify({
    model: AI.ocrModel,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: PROMPT },
          { type: 'image_url', image_url: { url: `data:image/png;base64,${pngBase64}` } }
        ]
      }
    ]
  })
  console.log(`ocr: model=${AI.ocrModel} image=${Math.round(pngBase64.length / 1024)}kb`)
  for (let attempt = 0; ; attempt++) {
    // Abort a stalled request instead of hanging the UI forever.
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 90000)
    let res: Response
    try {
      res = await fetch(`${AI.openaiBaseURL}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${AI.openaiApiKey}` },
        body,
        signal: ctrl.signal
      })
    } finally {
      clearTimeout(timer)
    }
    console.log(`ocr: status=${res.status}`)
    if (res.ok) {
      const data = (await res.json()) as { choices: { message: { content: string } }[] }
      const out = (data.choices?.[0]?.message?.content ?? '').trim()
      console.log(`ocr: got ${out.length} chars`)
      return out
    }
    const text = await res.text()
    if (res.status === 429 && attempt < MAX_RETRIES) {
      const hinted = Number(res.headers.get('retry-after')) || Number(text.match(/retry after (\d+)/i)?.[1])
      await sleep((Number.isFinite(hinted) && hinted > 0 ? hinted : attempt + 1) * 1000)
      continue
    }
    throw new Error(`ocr ${res.status}: ${text}`)
  }
}
