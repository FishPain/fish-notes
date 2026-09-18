import Database from 'better-sqlite3'
import { DateTime } from 'luxon'
import { Canvas } from './types.js'

const EMPTY_DOC = { type: 'doc', content: [] }

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

export const createCanvas = (db: Database.Database, title: string, description = ''): number => {
  const info = db
    .prepare('INSERT INTO canvases (title, description, doc, updatedAt) VALUES (?, ?, ?, ?)')
    .run(title, description, JSON.stringify(EMPTY_DOC), DateTime.now().toISO())
  return Number(info.lastInsertRowid)
}

export const getCanvas = (db: Database.Database, id: number): Canvas | null => {
  const row = db.prepare('SELECT * FROM canvases WHERE id = ?').get(id) as CanvasRow | undefined
  return row ? rowToCanvas(row) : null
}

export const listCanvases = (db: Database.Database): Canvas[] =>
  (db.prepare('SELECT * FROM canvases ORDER BY updatedAt DESC').all() as CanvasRow[]).map(rowToCanvas)

// The whole note doc is opaque JSON owned by the editor; we just persist it.
export const saveDoc = (db: Database.Database, id: number, doc: unknown): void => {
  db.prepare('UPDATE canvases SET doc = ?, updatedAt = ? WHERE id = ?').run(
    JSON.stringify(doc),
    DateTime.now().toISO(),
    id
  )
}

export const markCollated = (db: Database.Database, id: number): void => {
  db.prepare('UPDATE canvases SET collatedAt = ? WHERE id = ?').run(DateTime.now().toISO(), id)
}
