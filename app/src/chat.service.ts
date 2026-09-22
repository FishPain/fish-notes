import Database from 'better-sqlite3'
import { Capture } from './types.js'
import { hybridSearch } from './search.service.js'
import { RETRIEVAL } from './constants.js'
import { GenerateFn } from './ask.service.js'

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface ChatResult {
  answer: string
  citations: Capture[]
}

const HISTORY_LIMIT = 12 // recent messages kept in the prompt (bounds size)

const buildPrompt = (messages: ChatMessage[], captures: Capture[]): string => {
  const sources = captures
    .map((c, i) => `[${i + 1}] ${c.content}${c.note ? `\n(my note: ${c.note})` : ''}`)
    .join('\n\n')
  const convo = messages
    .slice(-HISTORY_LIMIT)
    .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
    .join('\n')
  return `You are a helpful assistant answering from the user's saved sources. Use ONLY the numbered SOURCES for facts and cite them by number like [1]. If the sources don't contain the answer, say so. Continue the conversation naturally.

SOURCES:
${sources}

CONVERSATION:
${convo}
Assistant:`
}

// Answer the latest user turn, grounded in retrieved captures. docIds (uploadIds)
// scope retrieval to specific uploaded documents.
export const chatAnswer = async (
  db: Database.Database,
  messages: ChatMessage[],
  generate: GenerateFn,
  docIds?: string[]
): Promise<ChatResult> => {
  const query = [...messages].reverse().find((m) => m.role === 'user')?.content ?? ''
  const scoped = docIds && docIds.length > 0
  const hits = await hybridSearch(db, query, scoped ? RETRIEVAL.k * 5 : RETRIEVAL.k)
  const kept = (scoped ? hits.filter((h) => docIds!.includes(h.capture.source.uploadId ?? '')) : hits).slice(
    0,
    RETRIEVAL.k
  )
  const citations = kept.map((h) => h.capture)
  const answer = await generate(buildPrompt(messages, citations))
  return { answer, citations }
}
