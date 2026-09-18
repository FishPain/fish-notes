import 'dotenv/config'

export const DEBUG = process.env.NODE_ENV === 'development'

export const SERVER = {
  port: Number(process.env.CANVAS_PORT || 7645),
  token: process.env.CANVAS_TOKEN || ''
}

export const DB = {
  path: process.env.CANVAS_DB || 'canvas.db'
}

export const AI = {
  provider: (process.env.CANVAS_AI_PROVIDER || 'ollama') as 'anthropic' | 'ollama',
  model:
    process.env.CANVAS_AI_MODEL ||
    (process.env.CANVAS_AI_PROVIDER === 'anthropic' ? 'claude-sonnet-5' : 'llama3.1'),
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  ollamaBaseURL: process.env.OLLAMA_BASE_URL || 'http://localhost:11434/api'
}
