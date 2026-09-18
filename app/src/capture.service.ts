import Database from 'better-sqlite3'
import { DateTime } from 'luxon'
import { Capture, CaptureInput } from './types.js'
import { embed } from './embeddings.js'

interface CaptureRow {
  id: number
  content: string
  contextText: string
  note: string
  source: string
  screenshot: string | null
  tags: string
  capturedAt: string
}

const rowToCapture = (row: CaptureRow): Capture => ({
  id: row.id,
  content: row.content,
  contextText: row.contextText,
  note: row.note,
  source: JSON.parse(row.source),
  screenshot: row.screenshot,
  tags: JSON.parse(row.tags),
  capturedAt: row.capturedAt
})

const searchableText = (n: { content: string; contextText?: string; note?: string }): string =>
  [n.content, n.contextText || '', n.note || ''].filter(Boolean).join('\n')

export const insertCapture = async (db: Database.Database, input: CaptureInput): Promise<number> => {
  const capturedAt = input.capturedAt || DateTime.now().toISO()
  const info = db
    .prepare(
      `INSERT INTO captures (content, contextText, note, source, screenshot, tags, capturedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.content,
      input.contextText || '',
      input.note || '',
      JSON.stringify(input.source),
      input.screenshot || null,
      JSON.stringify(input.tags || []),
      capturedAt
    )
  const id = Number(info.lastInsertRowid)
  const text = searchableText(input)
  db.prepare('INSERT INTO captures_fts (capture_id, text) VALUES (?, ?)').run(id, text)
  const vector = await embed(text)
  // ponytail: vec0 rejects plain JS numbers as primary key; bind BigInt
  db.prepare('INSERT INTO vec_captures (capture_id, embedding) VALUES (?, ?)').run(BigInt(id), JSON.stringify(vector))
  return id
}

export const getCapture = (db: Database.Database, id: number): Capture | null => {
  const row = db.prepare('SELECT * FROM captures WHERE id = ?').get(id) as CaptureRow | undefined
  return row ? rowToCapture(row) : null
}

export const listCaptures = (db: Database.Database): Capture[] =>
  (db.prepare('SELECT * FROM captures ORDER BY capturedAt DESC').all() as CaptureRow[]).map(rowToCapture)

export const deleteCapture = (db: Database.Database, id: number): void => {
  db.prepare('DELETE FROM captures WHERE id = ?').run(id)
  db.prepare('DELETE FROM captures_fts WHERE capture_id = ?').run(id)
  db.prepare('DELETE FROM vec_captures WHERE capture_id = ?').run(id)
}
