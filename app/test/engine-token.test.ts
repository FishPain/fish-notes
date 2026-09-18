import { describe, it, expect } from 'vitest'
import { readFileSync, rmSync, mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { loadOrCreateToken } from '../electron/engine-token.js'

describe('loadOrCreateToken', () => {
  it('creates a token file on first call and reuses it after', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cn-'))
    const t1 = loadOrCreateToken(dir)
    expect(t1).toHaveLength(64)
    const onDisk = readFileSync(join(dir, 'engine-token'), 'utf8').trim()
    expect(onDisk).toBe(t1)
    const t2 = loadOrCreateToken(dir)
    expect(t2).toBe(t1)
    rmSync(dir, { recursive: true, force: true })
  })
})
