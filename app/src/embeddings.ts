import { EMBEDDING } from './constants.js'

// The proxy caps embedding input at 8192 tokens. Captured context can be a whole
// page section, so truncate to a safe char budget (~a few thousand tokens) — a
// representative chunk is plenty for retrieval, and it avoids 400s on long text.
const MAX_INPUT_CHARS = 8000

// Embed text via the OpenAI-compatible proxy (no local model). Returns the raw
// embedding vector (EMBEDDING.dim floats).
export const embed = async (text: string): Promise<number[]> => {
  const input = text.slice(0, MAX_INPUT_CHARS) || ' '
  const res = await fetch(`${EMBEDDING.baseUrl}/embeddings`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${EMBEDDING.apiKey}` },
    body: JSON.stringify({ model: EMBEDDING.model, input })
  })
  if (!res.ok) throw new Error(`embeddings ${res.status}: ${await res.text()}`)
  const data = (await res.json()) as { data: { embedding: number[] }[] }
  return data.data[0].embedding
}
