import Database from 'better-sqlite3'
import { Capture } from './types.js'
import { hybridSearch } from './search.service.js'
import { RETRIEVAL } from './constants.js'

export type GenerateFn = (prompt: string) => Promise<string>

export interface AskResult {
  answer: string
  citations: Capture[]
}

const buildPrompt = (question: string, captures: Capture[]): string => {
  const context = captures
    .map((c, i) => `[${i + 1}] ${c.content}${c.note ? `\n(my note: ${c.note})` : ''}`)
    .join('\n\n')
  return `Answer using only these sources. Cite them by number. If they do not contain the answer, say so.\n\nSOURCES:\n${context}\n\nQUESTION: ${question}`
}

export const ask = async (
  db: Database.Database,
  question: string,
  generate: GenerateFn,
  k = RETRIEVAL.k
): Promise<AskResult> => {
  const hits = await hybridSearch(db, question, k)
  const citations = hits.map((h) => h.capture)
  const answer = await generate(buildPrompt(question, citations))
  return { answer, citations }
}
