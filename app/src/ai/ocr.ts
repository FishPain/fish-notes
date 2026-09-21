import { AI } from '../constants.js'
import { proxyPost } from './proxy.js'

const PROMPT =
  'Transcribe the content of this image as GitHub-Flavored Markdown. ' +
  'Preserve structure: render tables as Markdown tables, bullet/numbered lists as Markdown lists, ' +
  'headings with #, and code as fenced code blocks. Keep the text verbatim. ' +
  'Output only the Markdown — no commentary, no code fence around the whole thing. ' +
  'If there is no text, output nothing.'

// OCR a PNG (base64, no data-URL prefix) via the proxy's vision model. Returns the
// text (may be empty). 90s timeout so a stalled request can't hang the UI.
export const ocrImage = async (pngBase64: string): Promise<string> => {
  const res = await proxyPost(
    '/chat/completions',
    {
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
    },
    { timeoutMs: 90000 }
  )
  const data = (await res.json()) as { choices: { message: { content: string } }[] }
  return (data.choices?.[0]?.message?.content ?? '').trim()
}
