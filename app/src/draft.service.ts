import Database from 'better-sqlite3'
import { getCanvas } from './canvas.service.js'
import { hybridSearch } from './search.service.js'
import { GenerateMarkdownFn, Source } from './ai/markdown-generator.js'

const RETRIEVE_K = 12

const sourcesFor = async (db: Database.Database, query: string): Promise<Source[]> => {
  const hits = await hybridSearch(db, query, RETRIEVE_K)
  return hits.map((h) => ({ id: h.capture.id, content: h.capture.content, url: h.capture.source.url }))
}

// One-time draft from the canvas topic (used at creation).
export const draftFromSources = async (
  db: Database.Database,
  canvasId: number,
  generate: GenerateMarkdownFn
): Promise<string> => {
  const canvas = getCanvas(db, canvasId)
  if (!canvas) return ''
  const topic = [canvas.title, canvas.description].filter(Boolean).join(' — ')
  return generate(`Write a concise brief on "${topic}".`, await sourcesFor(db, topic), '')
}

// Inline /llm command: follow the user's prompt with the current doc as context.
export const completeInline = async (
  db: Database.Database,
  canvasId: number,
  prompt: string,
  docContext: string,
  generate: GenerateMarkdownFn
): Promise<string> => {
  const canvas = getCanvas(db, canvasId)
  if (!canvas) return ''
  const query = [prompt, canvas.title].filter(Boolean).join(' ')
  return generate(prompt, await sourcesFor(db, query), docContext)
}
