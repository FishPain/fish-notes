import { describe, it, expect } from 'vitest'
import { openDb } from '../src/db.js'
import { insertCapture } from '../src/capture.service.js'
import { keywordSearch, semanticSearch, hybridSearch } from '../src/search.service.js'

const seed = async () => {
  const db = openDb(':memory:')
  await insertCapture(db, { content: 'React hooks let you use state in function components', source: { type: 'web' } })
  await insertCapture(db, { content: 'Sourdough bread needs a long fermentation', source: { type: 'web' } })
  await insertCapture(db, { content: 'useEffect runs after render in React', source: { type: 'web' } })
  return db
}

describe('search.service', () => {
  it('keyword matches exact terms', async () => {
    const db = await seed()
    const r = keywordSearch(db, 'sourdough', 10)
    expect(r.map((x) => x.capture.content).join(' ')).toContain('Sourdough')
    db.close()
  })

  it('semantic finds conceptually related without shared words', async () => {
    const db = await seed()
    const r = await semanticSearch(db, 'managing component state in a UI framework', 3)
    expect(r[0].capture.content).toMatch(/React|hooks|useEffect/)
    db.close()
  })

  it('hybrid returns de-duplicated results', async () => {
    const db = await seed()
    const r = await hybridSearch(db, 'React state', 10)
    const ids = r.map((x) => x.capture.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(r.length).toBeGreaterThan(0)
    db.close()
  })

  it('hybrid ranks a capture found by both keyword and semantic first', async () => {
    const db = await seed()
    const kw = keywordSearch(db, 'React', 10)
    const sem = await semanticSearch(db, 'React', 10)
    const shared = kw.map((x) => x.capture.id).filter((id) => sem.some((s) => s.capture.id === id))
    expect(shared.length).toBeGreaterThan(0)
    const r = await hybridSearch(db, 'React', 10)
    expect(shared).toContain(r[0].capture.id)
    db.close()
  })
})
