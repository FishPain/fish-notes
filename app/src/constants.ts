// Load .env from the working directory (dev + node engine). The packaged Electron
// app loads the user's .env from userData first (see electron/load-env.ts); dotenv
// does not override vars already set, so both paths coexist.
import 'dotenv/config'

export const DEBUG = process.env.NODE_ENV === 'development'

export const SERVER = {
  port: Number(process.env.CANVAS_PORT || 7645),
  token: process.env.CANVAS_TOKEN || ''
}

export const DB = {
  path: process.env.CANVAS_DB || 'canvas.db'
}

const AI_PROVIDER = (process.env.CANVAS_AI_PROVIDER || 'openai') as 'anthropic' | 'openai'
const DEFAULT_MODEL = { anthropic: 'claude-sonnet-5', openai: 'gpt-5-mini' }
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || 'http://localhost:6655/openai/v1'

export const AI = {
  provider: AI_PROVIDER,
  model: process.env.CANVAS_AI_MODEL || DEFAULT_MODEL[AI_PROVIDER],
  // Screen-capture OCR uses a multimodal model via the proxy; default to a known
  // vision-capable model, overridable if the proxy exposes a different one.
  ocrModel: process.env.CANVAS_OCR_MODEL || 'gpt-4.1-mini',
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  openaiApiKey: process.env.OPENAI_API_KEY,
  openaiBaseURL: OPENAI_BASE_URL
}

// Embeddings go through the same OpenAI-compatible proxy (no local model).
export const EMBEDDING = {
  baseUrl: OPENAI_BASE_URL,
  apiKey: process.env.OPENAI_API_KEY,
  model: process.env.CANVAS_EMBED_MODEL || 'text-embedding-3-small',
  dim: Number(process.env.CANVAS_EMBED_DIM || 1536)
}
