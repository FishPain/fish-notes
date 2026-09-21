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

// Rules that keep output insertable (not a chat reply) — applied to both modes.
const RULES = `Output ONLY the content to insert into the note — no preamble, no sign-off, no meta-commentary. NEVER address the user or ask questions (never write "Do you mean", "Pick one", "Tell me which", etc.). If the request is ambiguous, pick the most reasonable interpretation from the context and just write it.

Use GitHub-flavored Markdown, concise and non-repetitive. Prefer facts from the numbered SOURCES; if the sources don't cover the request, write from general knowledge — do not refuse or ask for clarification. Cite a source inline as a Markdown link [text](url) ONLY when that source has a real URL; never emit empty or placeholder links like [ref]() or [ref](#).`

const buildPrompt = (instruction: string, sources: Source[], docContext: string): string => {
  const src = sources
    .map((s) => `[${s.id}] ${s.content}${s.url ? ` (source: ${s.url})` : ''}`)
    .join('\n')
  const mode = docContext.trim()
    ? `This text will be inserted at a specific point in an existing document. Match the surrounding voice and formatting. If the text before the insertion point is prose or ends mid-sentence, CONTINUE AS PROSE — do not start a bulleted/numbered list or a heading unless it clearly fits what surrounds the insertion point. Do not repeat the surrounding text.

${docContext}`
    : `Write a concise, well-structured brief. Headings and lists are fine.`
  return `INSTRUCTION: ${instruction}

${RULES}

${mode}

SOURCES:
${src}`
}

export const makeMarkdownGenerator = (ai: AiConfig, textFn?: TextFn): GenerateMarkdownFn => {
  const generate: TextFn =
    textFn ?? (async (prompt: string) => (await generateText({ model: createModel(ai), prompt })).text)
  return (instruction, sources, docContext) => generate(buildPrompt(instruction, sources, docContext))
}
