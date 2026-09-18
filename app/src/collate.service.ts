import Database from 'better-sqlite3'
import { randomUUID } from 'crypto'
import { RawSegment, Segment } from './types.js'
import { getCanvas, saveDoc, markCollated } from './canvas.service.js'
import { hybridSearch } from './search.service.js'

export type GenerateSegmentsFn = (
  topic: string,
  sources: { id: number; content: string }[],
  lockedText: string[]
) => Promise<RawSegment[]>

const RETRIEVE_K = 12

// Retrieve relevant captures for the canvas, ask the generator for fresh AI
// segments grounded in them, then merge: keep user-locked segments (re-anchored
// at their original positions), replace AI segments, and keep only citations that
// point at retrieved captures (drop hallucinations).
export const collate = async (
  db: Database.Database,
  canvasId: number,
  generateSegments: GenerateSegmentsFn
): Promise<Segment[]> => {
  const canvas = getCanvas(db, canvasId)
  if (!canvas) return []

  // Title + description drives both retrieval and the synthesis prompt.
  const topic = [canvas.title, canvas.description].filter(Boolean).join(' — ')
  const hits = await hybridSearch(db, topic, RETRIEVE_K)
  const sources = hits.map((h) => ({ id: h.capture.id, content: h.capture.content }))
  const allowed = new Set(sources.map((s) => s.id))

  const locked = canvas.doc
    .map((s, index) => ({ s, index }))
    .filter((x) => x.s.origin === 'user')

  const raw = await generateSegments(
    topic,
    sources,
    locked.map((x) => x.s.text)
  )

  const aiSegments: Segment[] = raw.map((r) => ({
    id: randomUUID(),
    heading: r.heading,
    text: r.text,
    origin: 'ai',
    citations: [...new Set(r.citations.filter((id) => allowed.has(id)))]
  }))

  // Re-insert locked segments at their original indices (clamped) among AI ones.
  const doc = [...aiSegments]
  for (const { s, index } of locked) {
    doc.splice(Math.min(index, doc.length), 0, s)
  }

  saveDoc(db, canvasId, doc)
  markCollated(db, canvasId)
  return doc
}
