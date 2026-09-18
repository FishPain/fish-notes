import { generateText } from 'ai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createOllama } from 'ollama-ai-provider'
import { GenerateFn } from './ask.service.js'

interface AiConfig {
  provider: 'anthropic' | 'ollama'
  model: string
  anthropicApiKey?: string
  ollamaBaseURL: string
}

// Provider choice is config only; calling code is identical.
export const makeGenerate = (ai: AiConfig): GenerateFn => {
  const model =
    ai.provider === 'anthropic'
      ? createAnthropic({ apiKey: ai.anthropicApiKey })(ai.model)
      : createOllama({ baseURL: ai.ollamaBaseURL })(ai.model)
  return async (prompt: string) => {
    const { text } = await generateText({ model, prompt })
    return text
  }
}
