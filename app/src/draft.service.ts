import Database from 'better-sqlite3'
import { RawSegment } from './types.js'
import { getCanvas, markCollated } from './canvas.service.js'
import { hybridSearch } from './search.service.js'

export type GenerateSegmentsFn = (
  topic: string,
  sources: { id: number; content: string }[],
  lockedText: string[]
) => Promise<RawSegment[]>

const RETRIEVE_K = 12

// Retrieve relevant captures for the canvas topic and ask the generator for
// grounded sections. Returns them for the editor to INSERT (nothing stored/merged).
// Citations are filtered to retrieved captures (drop hallucinations).
export const draftFromSources = async (
  db: Database.Database,
  canvasId: number,
  generateSegments: GenerateSegmentsFn
): Promise<RawSegment[]> => {
  const canvas = getCanvas(db, canvasId)
  if (!canvas) return []

  const topic = [canvas.title, canvas.description].filter(Boolean).join(' — ')
  const hits = await hybridSearch(db, topic, RETRIEVE_K)
  const sources = hits.map((h) => ({ id: h.capture.id, content: h.capture.content }))
  const allowed = new Set(sources.map((s) => s.id))

  const raw = await generateSegments(topic, sources, [])
  markCollated(db, canvasId)

  return raw.map((r) => ({
    heading: r.heading,
    text: r.text,
    citations: [...new Set(r.citations.filter((id) => allowed.has(id)))]
  }))
}
