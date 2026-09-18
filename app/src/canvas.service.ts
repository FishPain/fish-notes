import Database from 'better-sqlite3'
import { DateTime } from 'luxon'
import { Canvas, Segment } from './types.js'

interface CanvasRow {
  id: number
  title: string
  doc: string
  updatedAt: string
}

const rowToCanvas = (row: CanvasRow): Canvas => ({
  id: row.id,
  title: row.title,
  doc: JSON.parse(row.doc),
  updatedAt: row.updatedAt
})

export const createCanvas = (db: Database.Database, title: string): number => {
  const info = db
    .prepare('INSERT INTO canvases (title, doc, updatedAt) VALUES (?, ?, ?)')
    .run(title, '[]', DateTime.now().toISO())
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
