import Database from 'better-sqlite3'
import { DateTime } from 'luxon'
import { Canvas, Segment } from './types.js'

interface CanvasRow {
  id: number
  title: string
  description: string
  doc: string
  updatedAt: string
  collatedAt: string
}

const rowToCanvas = (row: CanvasRow): Canvas => ({
  id: row.id,
  title: row.title,
  description: row.description,
  doc: JSON.parse(row.doc),
  updatedAt: row.updatedAt,
  collatedAt: row.collatedAt
})

// Records that a canvas was just collated (drives the "N new sources since" nudge).
export const markCollated = (db: Database.Database, id: number): void => {
  db.prepare('UPDATE canvases SET collatedAt = ? WHERE id = ?').run(DateTime.now().toISO(), id)
}

export const createCanvas = (db: Database.Database, title: string, description = ''): number => {
  const info = db
    .prepare('INSERT INTO canvases (title, description, doc, updatedAt) VALUES (?, ?, ?, ?)')
    .run(title, description, '[]', DateTime.now().toISO())
  return Number(info.lastInsertRowid)
}

export const getCanvas = (db: Database.Database, id: number): Canvas | null => {
  const row = db.prepare('SELECT * FROM canvases WHERE id = ?').get(id) as CanvasRow | undefined
  return row ? rowToCanvas(row) : null
}

export const listCanvases = (db: Database.Database): Canvas[] =>
  (db.prepare('SELECT * FROM canvases ORDER BY updatedAt DESC').all() as CanvasRow[]).map(rowToCanvas)

export const saveDoc = (db: Database.Database, id: number, doc: Segment[]): void => {
  db.prepare('UPDATE canvases SET doc = ?, updatedAt = ? WHERE id = ?').run(
    JSON.stringify(doc),
    DateTime.now().toISO(),
    id
  )
}

// Editing a segment locks it as the user's ground truth so refresh won't touch it.
export const updateSegment = (db: Database.Database, id: number, segmentId: string, text: string): void => {
  const canvas = getCanvas(db, id)
  if (!canvas) return
  const doc = canvas.doc.map((s) =>
    s.id === segmentId ? { ...s, text, origin: 'user' as const } : s
  )
  saveDoc(db, id, doc)
}
