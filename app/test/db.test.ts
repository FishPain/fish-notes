import { describe, it, expect } from 'vitest'
import { openDb } from '../src/db.js'

describe('openDb', () => {
  it('creates tables and loads sqlite-vec', () => {
    const db = openDb(':memory:')
    const names = db
      .prepare("SELECT name FROM sqlite_master WHERE type IN ('table','view')")
      .all()
      .map((r: { name: string }) => r.name)
    expect(names).toContain('captures')
    expect(names).toContain('captures_fts')
    expect(names).toContain('vec_captures')
    const v = db.prepare('SELECT vec_version() AS v').get() as { v: string }
    expect(typeof v.v).toBe('string')
    db.close()
  })
})
