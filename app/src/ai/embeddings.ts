import { EMBEDDING } from '../constants.js'
import { proxyPost } from './proxy.js'

// The proxy caps embedding input at 8192 tokens. Captured context can be a whole
// page section, so truncate to a safe char budget — a representative chunk is
// plenty for retrieval, and it avoids 400s on long text.
const MAX_INPUT_CHARS = 8000

// Embed text via the OpenAI-compatible proxy. Returns the raw vector (EMBEDDING.dim floats).
export const embed = async (text: string): Promise<number[]> => {
  const input = text.slice(0, MAX_INPUT_CHARS) || ' '
  const res = await proxyPost('/embeddings', { model: EMBEDDING.model, input })
  const data = (await res.json()) as { data: { embedding: number[] }[] }
  return data.data[0].embedding
}
