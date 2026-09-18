import { EMBEDDING } from './constants.js'

// The proxy caps embedding input at 8192 tokens. Captured context can be a whole
// page section, so truncate to a safe char budget (~a few thousand tokens) — a
// representative chunk is plenty for retrieval, and it avoids 400s on long text.
const MAX_INPUT_CHARS = 8000
const MAX_RETRIES = 4

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

// Embed text via the OpenAI-compatible proxy (no local model). Returns the raw
// embedding vector (EMBEDDING.dim floats). Retries on 429 (proxy rate limit),
// honouring Retry-After / the "retry after N seconds" hint, with a capped backoff.
export const embed = async (text: string): Promise<number[]> => {
  const input = text.slice(0, MAX_INPUT_CHARS) || ' '
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${EMBEDDING.baseUrl}/embeddings`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${EMBEDDING.apiKey}` },
      body: JSON.stringify({ model: EMBEDDING.model, input })
    })
    if (res.ok) {
      const data = (await res.json()) as { data: { embedding: number[] }[] }
      return data.data[0].embedding
    }
    const body = await res.text()
    if (res.status === 429 && attempt < MAX_RETRIES) {
      const hinted = Number(res.headers.get('retry-after')) || Number(body.match(/retry after (\d+)/i)?.[1])
      await sleep((Number.isFinite(hinted) && hinted > 0 ? hinted : attempt + 1) * 1000)
      continue
    }
    throw new Error(`embeddings ${res.status}: ${body}`)
  }
}
