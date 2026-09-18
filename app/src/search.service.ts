import Database from 'better-sqlite3'
import { SearchResult } from './types.js'
import { getCapture } from './capture.service.js'
import { embed } from './embeddings.js'

const hydrate = (db: Database.Database, rows: { capture_id: number; score: number }[]): SearchResult[] => {
  const out: SearchResult[] = []
  for (const r of rows) {
    const capture = getCapture(db, r.capture_id)
    if (capture) out.push({ capture, score: r.score })
  }
  return out
}

// ponytail: FTS5 MATCH parses punctuation as query syntax, so a natural-language
// question throws. Quote each word token and OR them for recall. Naive tokenizer,
// swap for a real query parser if operators (AND/NEAR/prefix) are ever needed.
const toFtsQuery = (query: string): string =>
  (query.match(/[\p{L}\p{N}]+/gu) || []).map((t) => `"${t}"`).join(' OR ')

export const keywordSearch = (db: Database.Database, query: string, limit: number): SearchResult[] => {
  const match = toFtsQuery(query)
  if (!match) return []
  const rows = db
    .prepare(
      `SELECT capture_id, -bm25(captures_fts) AS score
       FROM captures_fts WHERE captures_fts MATCH ? ORDER BY score DESC LIMIT ?`
    )
    .all(match, limit) as { capture_id: number; score: number }[]
  return hydrate(db, rows)
}

export const semanticSearch = async (
  db: Database.Database,
  query: string,
  limit: number
): Promise<SearchResult[]> => {
  const vector = await embed(query)
  // ponytail: this sqlite-vec build requires the `k = ?` KNN constraint, not LIMIT alone
  const rows = db
    .prepare('SELECT capture_id, distance FROM vec_captures WHERE embedding MATCH ? AND k = ? ORDER BY distance')
    .all(JSON.stringify(vector), limit) as { capture_id: number; distance: number }[]
  return hydrate(db, rows.map((r) => ({ capture_id: r.capture_id, score: 1 / (1 + r.distance) })))
}

export const hybridSearch = async (
  db: Database.Database,
  query: string,
  limit: number
): Promise<SearchResult[]> => {
  const [kw, sem] = await Promise.all([Promise.resolve(keywordSearch(db, query, limit)), semanticSearch(db, query, limit)])
  // ponytail: Reciprocal Rank Fusion (k=60) merges the two lists by rank, not raw
  // score, so unbounded bm25 can't drown the [0,1] semantic scores.
  const RRF_K = 60
  const fused = new Map<number, SearchResult>()
  for (const list of [kw, sem]) {
    list.forEach((r, rank) => {
      const contribution = 1 / (RRF_K + rank)
      const existing = fused.get(r.capture.id)
      if (existing) existing.score += contribution
      else fused.set(r.capture.id, { capture: r.capture, score: contribution })
    })
  }
  return [...fused.values()].sort((a, b) => b.score - a.score).slice(0, limit)
}
