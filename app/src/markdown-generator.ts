import { generateText } from 'ai'
import { AiConfig, createModel } from './model.js'

export interface Source {
  id: number
  content: string
  url?: string
}

// Follows an instruction, grounded ONLY in the given sources, using the current
// document as optional context. Returns markdown; cites sources as links.
export type GenerateMarkdownFn = (instruction: string, sources: Source[], docContext: string) => Promise<string>

type TextFn = (prompt: string) => Promise<string>

const buildPrompt = (instruction: string, sources: Source[], docContext: string): string => {
  const src = sources
    .map((s) => `[${s.id}] ${s.content}${s.url ? ` (source: ${s.url})` : ''}`)
    .join('\n')
  const ctx = docContext.trim() ? `\n\nCURRENT DOCUMENT (context — do not repeat verbatim):\n${docContext}` : ''
  return `${instruction}

Write GitHub-flavored Markdown. Be concise and non-repetitive. Use ONLY the numbered sources for facts; when you use one, cite it inline as a markdown link to its source url, e.g. [ref](https://…). Do not invent sources.${ctx}

SOURCES:
${src}`
}

export const makeMarkdownGenerator = (ai: AiConfig, textFn?: TextFn): GenerateMarkdownFn => {
  const generate: TextFn =
    textFn ?? (async (prompt: string) => (await generateText({ model: createModel(ai), prompt })).text)
  return (instruction, sources, docContext) => generate(buildPrompt(instruction, sources, docContext))
}
