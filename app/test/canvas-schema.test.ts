import { describe, it, expect } from 'vitest'
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
})
