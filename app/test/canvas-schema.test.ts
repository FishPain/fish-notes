import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { openDb } from '../src/db.js'

describe('canvases table', () => {
  it('exists after migration', () => {
    const db = openDb(':memory:')
    const row = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='canvases'")
      .get() as { name: string } | undefined
    expect(row?.name).toBe('canvases')
    db.close()
  })

  it('adds the description column to a pre-existing canvases table', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cn-'))
    const file = join(dir, 'old.db')
    const raw = new Database(file)
    raw.prepare('CREATE TABLE canvases (id INTEGER PRIMARY KEY, title TEXT NOT NULL, doc TEXT, updatedAt TEXT)').run()
    raw.close()

    const db = openDb(file) // runs migrate -> ensureColumn
    const cols = (db.prepare('PRAGMA table_info(canvases)').all() as { name: string }[]).map((c) => c.name)
    expect(cols).toContain('description')
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })
})
