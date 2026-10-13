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
  return `You are a helpful assistant in the user's notes app. Their saved SOURCES (retrieved for this turn) are below.

- If the question relates to the sources, ground your answer in them and cite the ones you use by number like [1].
- If it's a general question the sources don't cover, just answer it normally from your own knowledge. Do NOT mention the sources or point out that they lack the info — only say a source doesn't contain something when the user is clearly asking about their saved material.
- Only cite a source you actually used.

SOURCES:
${sources}

CONVERSATION:
${convo}
Assistant:`
}

// Answer the latest user turn, grounded in retrieved captures. `focusRefs` scope
// retrieval to specific sources: an uploadId focuses a whole uploaded document; a
// "capture:<id>" ref focuses a single capture (e.g. a screenshot).
export const chatAnswer = async (
  db: Database.Database,
  messages: ChatMessage[],
  generate: GenerateFn,
  focusRefs?: string[]
): Promise<ChatResult> => {
  const query = [...messages].reverse().find((m) => m.role === 'user')?.content ?? ''
  const scoped = focusRefs != null && focusRefs.length > 0
  const captureIds = new Set((focusRefs ?? []).filter((r) => r.startsWith('capture:')).map((r) => Number(r.slice(8))))
  const uploadIds = new Set((focusRefs ?? []).filter((r) => !r.startsWith('capture:')))
  const hits = await hybridSearch(db, query, scoped ? RETRIEVAL.k * 5 : RETRIEVAL.k)
  const kept = (
    scoped
      ? hits.filter((h) => uploadIds.has(h.capture.source.uploadId ?? '') || captureIds.has(h.capture.id))
      : hits
  ).slice(0, RETRIEVAL.k)
  const retrieved = kept.map((h) => h.capture)
  const answer = await generate(buildPrompt(messages, retrieved))
  // Only surface sources the answer actually cited by [n]; drop the rest so an answer
  // like "I don't have that" doesn't show a stray, irrelevant source chip.
  // ponytail: relies on the model bracket-citing (the prompt mandates it).
  const cited = new Set([...answer.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1])))
  const citations = retrieved.filter((_c, i) => cited.has(i + 1))
  return { answer, citations }
}
