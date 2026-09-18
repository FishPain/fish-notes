import Database from 'better-sqlite3'
import * as sqliteVec from 'sqlite-vec'
import { EMBEDDING } from './constants.js'

const EMBED_DIM = EMBEDDING.dim

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS captures (
     id          INTEGER PRIMARY KEY AUTOINCREMENT,
     content     TEXT NOT NULL,
     contextText TEXT NOT NULL DEFAULT '',
     note        TEXT NOT NULL DEFAULT '',
     source      TEXT NOT NULL DEFAULT '{}',
     screenshot  TEXT,
     tags        TEXT NOT NULL DEFAULT '[]',
     capturedAt  TEXT NOT NULL
   )`,
  `CREATE VIRTUAL TABLE IF NOT EXISTS captures_fts USING fts5(capture_id UNINDEXED, text)`,
  `CREATE VIRTUAL TABLE IF NOT EXISTS vec_captures USING vec0(capture_id INTEGER PRIMARY KEY, embedding FLOAT[${EMBED_DIM}])`,
  `CREATE TABLE IF NOT EXISTS canvases (
     id          INTEGER PRIMARY KEY AUTOINCREMENT,
     title       TEXT NOT NULL,
     description TEXT NOT NULL DEFAULT '',
     doc         TEXT NOT NULL DEFAULT '[]',
     updatedAt   TEXT NOT NULL
   )`
]

const migrate = (db: Database.Database): void => {
  for (const statement of SCHEMA) db.prepare(statement).run()
}

export const openDb = (path: string): Database.Database => {
  const db = new Database(path)
  db.pragma('journal_mode = WAL')
  sqliteVec.load(db)
  migrate(db)
  return db
}
