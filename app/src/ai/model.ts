import { createAnthropic } from '@ai-sdk/anthropic'
import { createOpenAI } from '@ai-sdk/openai'

export interface AiConfig {
  provider: 'anthropic' | 'openai'
  model: string
  anthropicApiKey?: string
  openaiApiKey?: string
  openaiBaseURL?: string
}

// Maps our config to an AI SDK model. `openai` also covers any OpenAI-compatible
// proxy (e.g. the local Hyperspace proxy) via a custom baseURL.
export const createModel = (ai: AiConfig) => {
  if (ai.provider === 'anthropic') return createAnthropic({ apiKey: ai.anthropicApiKey })(ai.model)
  return createOpenAI({ apiKey: ai.openaiApiKey, baseURL: ai.openaiBaseURL })(ai.model)
}
