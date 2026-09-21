import Database from 'better-sqlite3'
import * as sqliteVec from 'sqlite-vec'
import { EMBEDDING } from './constants.js'

const EMBED_DIM = EMBEDDING.dim

// porter = stemming ("running" matches "run"); unicode61 = accent-folding + case.
const FTS_DDL = `CREATE VIRTUAL TABLE IF NOT EXISTS captures_fts USING fts5(capture_id UNINDEXED, text, tokenize = 'porter unicode61')`

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
  FTS_DDL,
  `CREATE VIRTUAL TABLE IF NOT EXISTS vec_captures USING vec0(capture_id INTEGER PRIMARY KEY, embedding FLOAT[${EMBED_DIM}])`,
  `CREATE TABLE IF NOT EXISTS canvases (
     id          INTEGER PRIMARY KEY AUTOINCREMENT,
     title       TEXT NOT NULL,
     description TEXT NOT NULL DEFAULT '',
     doc         TEXT NOT NULL DEFAULT '[]',
     updatedAt   TEXT NOT NULL
   )`
]

// Add a column to an existing table if it's missing (SQLite has no
// ADD COLUMN IF NOT EXISTS), so schema additions don't require wiping the DB.
const ensureColumn = (db: Database.Database, table: string, column: string, ddl: string): void => {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
  if (!cols.some((c) => c.name === column)) db.prepare(`ALTER TABLE ${table} ADD COLUMN ${ddl}`).run()
}

// CREATE VIRTUAL TABLE IF NOT EXISTS can't change an existing FTS tokenizer, so
// if the stored table def predates the porter tokenizer, rebuild + repopulate it
// from captures (the FTS text is content + contextText + note, per capture.service).
const migrateFtsTokenizer = (db: Database.Database): void => {
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE name = 'captures_fts'").get() as
    | { sql: string }
    | undefined
  if (!row || row.sql.includes('porter')) return
  db.prepare('DROP TABLE captures_fts').run()
  db.prepare(FTS_DDL).run()
  db.prepare(
    `INSERT INTO captures_fts (capture_id, text)
     SELECT id, content || char(10) || contextText || char(10) || note FROM captures`
  ).run()
}

const migrate = (db: Database.Database): void => {
  for (const statement of SCHEMA) db.prepare(statement).run()
  ensureColumn(db, 'canvases', 'description', "description TEXT NOT NULL DEFAULT ''")
  migrateFtsTokenizer(db)
}

export const openDb = (path: string): Database.Database => {
  const db = new Database(path)
  db.pragma('journal_mode = WAL')
  sqliteVec.load(db)
  migrate(db)
  return db
}
