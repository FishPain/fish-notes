import { EMBEDDING } from './constants.js'

// Embed text via the OpenAI-compatible proxy (no local model). Returns the raw
// embedding vector (EMBEDDING.dim floats).
export const embed = async (text: string): Promise<number[]> => {
  const res = await fetch(`${EMBEDDING.baseUrl}/embeddings`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${EMBEDDING.apiKey}` },
    body: JSON.stringify({ model: EMBEDDING.model, input: text })
  })
  if (!res.ok) throw new Error(`embeddings ${res.status}`)
  const data = (await res.json()) as { data: { embedding: number[] }[] }
  return data.data[0].embedding
}
