import { generateText } from 'ai'
import { AiConfig, createModel } from './model.js'
import { GenerateFn } from './ask.service.js'

// Provider choice is config only; calling code is identical.
export const makeGenerate = (ai: AiConfig): GenerateFn => {
  const model = createModel(ai)
  return async (prompt: string) => {
    const { text } = await generateText({ model, prompt })
    return text
  }
}
