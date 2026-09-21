# Phase 1a — Corpus Engine + Local API — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the headless corpus engine — store captures, embed them, and expose hybrid search + grounded ask over a token-guarded local HTTP API — so capturers and (later) the canvas UI can build on it.

**Architecture:** A TypeScript package under `app/` (later hosted in the Electron main process). SQLite (`better-sqlite3`) is the source of truth with FTS5 (keyword) and a `sqlite-vec` virtual table (embeddings). Embeddings run locally via `@xenova/transformers`. Ask routes through the Vercel AI SDK (Claude or Ollama by config). An Express server wraps services with a shared-token middleware and the project's HttpError/Reason error contract. Self-contained — no external service.

**Tech Stack:** Node, TypeScript, better-sqlite3, sqlite-vec, FTS5, @xenova/transformers, Vercel AI SDK (`ai`, `@ai-sdk/anthropic`, `ollama-ai-provider`), express, yup, luxon, vitest. Style: Dylan desktop dialect — arrow-const, named exports, single quotes, **no semicolons**, no trailing commas, `constants.ts` single config surface, no `any` (one eslint-disabled exception in the error handler), no `import type`, kebab-case files, `*.service.ts` / `*.controller.ts` suffixes.

---

## File Structure

```
app/
  package.json
  tsconfig.json
  vitest.config.ts
  .prettierrc          # semi:false, singleQuote:true, trailingComma:none
  src/
    constants.ts       # single config surface (SERVER, DB, AI, DEBUG)
    types.ts           # Capture, CaptureInput, SearchResult
    db.ts              # openDb + sqlite-vec + schema
    embeddings.ts      # embed(text) -> number[]
    generator.ts       # makeGenerate(AI) -> GenerateFn (Vercel AI SDK)
    capture.service.ts # insertCapture/getCapture/listCaptures/deleteCapture
    search.service.ts  # keywordSearch/semanticSearch/hybridSearch
    ask.service.ts     # ask(db, question, generate)
    utils/
      http-errors.ts   # HttpError, Reason, httpErrors, throwHttpError, errorHandler
    middleware/
      require-token.ts
    routes/
      capture/capture.controller.ts
      search/search.controller.ts
      ask/ask.controller.ts
    routes.ts          # aggregates routers onto the app
    server.ts          # buildServer(db, generate, token) -> express app
    index.ts           # entry: constants -> db -> server.listen
  test/
    *.test.ts
```

`db.ts` is the only module that opens the database; services take a `Database` instance so tests use `:memory:`.

---

## Task 0: Scaffold

**Files:** Create `app/package.json`, `app/tsconfig.json`, `app/vitest.config.ts`, `app/.prettierrc`

- [ ] **Step 1: `app/package.json`**

```json
{
  "name": "canvas-notes-engine",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "start": "tsx src/index.ts"
  },
  "dependencies": {
    "@ai-sdk/anthropic": "^1.0.0",
    "@xenova/transformers": "^2.17.2",
    "ai": "^4.0.0",
    "better-sqlite3": "^11.0.0",
    "dotenv": "^16.4.0",
    "express": "^4.19.2",
    "luxon": "^3.4.0",
    "ollama-ai-provider": "^1.0.0",
    "sqlite-vec": "^0.1.6",
    "yup": "^1.4.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.0",
    "@types/express": "^4.17.21",
    "@types/luxon": "^3.4.0",
    "@types/node": "^20.0.0",
    "tsx": "^4.0.0",
    "typescript": "^5.4.0",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 2: `app/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "outDir": "dist"
  },
  "include": ["src", "test"]
}
```

- [ ] **Step 3: `app/vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    testTimeout: 30000
  }
})
```

- [ ] **Step 4: `app/.prettierrc`** (codifies the desktop dialect)

```json
{ "semi": false, "singleQuote": true, "trailingComma": "none", "printWidth": 100 }
```

- [ ] **Step 5: Install + commit**

```bash
cd app && npm install
git add app/package.json app/tsconfig.json app/vitest.config.ts app/.prettierrc
git commit -m "chore: scaffold corpus engine"
```

---

## Task 1: Types + constants

**Files:** Create `app/src/types.ts`, `app/src/constants.ts`

- [ ] **Step 1: `app/src/types.ts`**

```typescript
export interface CaptureSource {
  type: 'web' | 'app'
  url?: string
  anchor?: string
  appName?: string
  windowTitle?: string
}

export interface CaptureInput {
  content: string
  contextText?: string
  note?: string
  source: CaptureSource
  screenshot?: string
  tags?: string[]
  capturedAt?: string
}

export interface Capture {
  id: number
  content: string
  contextText: string
  note: string
  source: CaptureSource
  screenshot: string | null
  tags: string[]
  capturedAt: string
}

export interface SearchResult {
  capture: Capture
  score: number
}
```

- [ ] **Step 2: `app/src/constants.ts`** (single config surface — nothing else reads `process.env`)

```typescript
import 'dotenv/config'

export const DEBUG = process.env.NODE_ENV === 'development'

export const SERVER = {
  port: Number(process.env.CANVAS_PORT || 7645),
  token: process.env.CANVAS_TOKEN || ''
}

export const DB = {
  path: process.env.CANVAS_DB || 'canvas.db'
}

export const AI = {
  provider: (process.env.CANVAS_AI_PROVIDER || 'ollama') as 'anthropic' | 'ollama',
  model:
    process.env.CANVAS_AI_MODEL ||
    (process.env.CANVAS_AI_PROVIDER === 'anthropic' ? 'claude-sonnet-5' : 'llama3.1'),
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  ollamaBaseURL: process.env.OLLAMA_BASE_URL || 'http://localhost:11434/api'
}
```

- [ ] **Step 3: Typecheck + commit**

```bash
cd app && npx tsc --noEmit
git add app/src/types.ts app/src/constants.ts
git commit -m "feat: engine types and config surface"
```

---

## Task 2: Error contract

**Files:** Create `app/src/utils/http-errors.ts`, Test `app/test/http-errors.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// app/test/http-errors.test.ts
import { describe, it, expect } from 'vitest'
import { httpErrors, Reason, throwHttpError } from '../src/utils/http-errors.js'

describe('throwHttpError', () => {
  it('with res, sends status + json and sets because to the reason', () => {
    let sentStatus = 0
    let sentBody: { because: string | null } = { because: 'unset' }
    const res = {
      status(code: number) {
        sentStatus = code
        return this
      },
      json(body: { because: string | null }) {
        sentBody = body
        return this
      }
    } as unknown as import('express').Response

    throwHttpError(httpErrors.unauthorized, Reason.Unauthorized, res)
    expect(sentStatus).toBe(401)
    expect(sentBody.because).toBe('unauthorized')
  })

  it('without res, throws the error payload', () => {
    expect(() => throwHttpError(httpErrors.notFound, Reason.NotFound)).toThrow()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd app && npx vitest run test/http-errors.test.ts`
Expected: FAIL — cannot find module `../src/utils/http-errors.js`.

- [ ] **Step 3: Implement**

```typescript
// app/src/utils/http-errors.ts
import { Request, Response, NextFunction } from 'express'
import { DEBUG } from '../constants.js'

export interface HttpError {
  statusCode: number
  type: string
  because: string | null
  stack?: unknown
}

export enum Reason {
  Unauthorized = 'unauthorized',
  MissingOrInvalidFields = 'missing_or_invalid_fields',
  NotFound = 'not_found'
}

export const httpErrors = {
  badRequest: { statusCode: 400, type: 'bad_request', because: null } as HttpError,
  unauthorized: { statusCode: 401, type: 'unauthorized', because: null } as HttpError,
  notFound: { statusCode: 404, type: 'not_found', because: null } as HttpError,
  serverError: (error: unknown): HttpError => ({
    statusCode: 500,
    type: 'server_error',
    because: null,
    stack: error
  })
}

export const throwHttpError = (error: HttpError, reason: Reason | null, res?: Response): void => {
  const payload: HttpError = { ...error, because: reason }
  if (res) {
    res.status(error.statusCode).json(payload)
    return
  }
  throw payload
}

export const errorHandler = (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  error: any,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  const httpError: HttpError = error && error.statusCode ? error : httpErrors.serverError(error)
  console.error(error && (error.stack || error))
  if (!DEBUG) delete httpError.stack
  res.status(httpError.statusCode).json(httpError)
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd app && npx vitest run test/http-errors.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/utils/http-errors.ts app/test/http-errors.test.ts
git commit -m "feat: HttpError/Reason error contract"
```

---

## Task 3: Database open + schema

**Files:** Create `app/src/db.ts`, Test `app/test/db.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// app/test/db.test.ts
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd app && npx vitest run test/db.test.ts`
Expected: FAIL — cannot find module `../src/db.js`.

- [ ] **Step 3: Implement** (each DDL statement runs via `prepare().run()`)

```typescript
// app/src/db.ts
import Database from 'better-sqlite3'
import * as sqliteVec from 'sqlite-vec'

const EMBED_DIM = 384

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
  `CREATE VIRTUAL TABLE IF NOT EXISTS vec_captures USING vec0(capture_id INTEGER PRIMARY KEY, embedding FLOAT[${EMBED_DIM}])`
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
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd app && npx vitest run test/db.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/db.ts app/test/db.test.ts
git commit -m "feat: open db, load sqlite-vec, create schema"
```

---

## Task 4: Embeddings

**Files:** Create `app/src/embeddings.ts`, Test `app/test/embeddings.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// app/test/embeddings.test.ts
import { describe, it, expect } from 'vitest'
import { embed } from '../src/embeddings.js'

describe('embed', () => {
  it('returns a normalized 384-dim vector', async () => {
    const v = await embed('hello world')
    expect(v).toHaveLength(384)
    const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0))
    expect(norm).toBeCloseTo(1, 2)
  })

  it('related text scores higher than unrelated', async () => {
    const dot = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i], 0)
    const cat = await embed('a fluffy domestic cat')
    const kitten = await embed('a small kitten')
    const finance = await embed('quarterly interest rate policy')
    expect(dot(cat, kitten)).toBeGreaterThan(dot(cat, finance))
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd app && npx vitest run test/embeddings.test.ts`
Expected: FAIL — cannot find module `../src/embeddings.js`.

- [ ] **Step 3: Implement**

```typescript
// app/src/embeddings.ts
import { pipeline, FeatureExtractionPipeline } from '@xenova/transformers'

let extractorPromise: Promise<FeatureExtractionPipeline> | null = null

const getExtractor = (): Promise<FeatureExtractionPipeline> => {
  if (!extractorPromise) {
    extractorPromise = pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2')
  }
  return extractorPromise
}

export const embed = async (text: string): Promise<number[]> => {
  const extractor = await getExtractor()
  const output = await extractor(text, { pooling: 'mean', normalize: true })
  return Array.from(output.data as Float32Array)
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd app && npx vitest run test/embeddings.test.ts`
Expected: PASS (first run downloads the model).

- [ ] **Step 5: Commit**

```bash
git add app/src/embeddings.ts app/test/embeddings.test.ts
git commit -m "feat: local embeddings via transformers.js"
```

---

## Task 5: Capture service

**Files:** Create `app/src/capture.service.ts`, Test `app/test/capture.service.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// app/test/capture.service.test.ts
import { describe, it, expect } from 'vitest'
import { openDb } from '../src/db.js'
import { insertCapture, getCapture, deleteCapture } from '../src/capture.service.js'

describe('capture.service', () => {
  it('inserts and reads back with parsed source/tags and a capturedAt', async () => {
    const db = openDb(':memory:')
    const id = await insertCapture(db, {
      content: 'mitochondria is the powerhouse of the cell',
      note: 'remember',
      source: { type: 'web', url: 'https://bio.example', anchor: '#:~:text=mitochondria' },
      tags: ['biology']
    })
    const c = getCapture(db, id)!
    expect(c.content).toContain('mitochondria')
    expect(c.source.url).toBe('https://bio.example')
    expect(c.tags).toEqual(['biology'])
    expect(c.capturedAt).toBeTruthy()
    db.close()
  })

  it('deletes a capture and its fts + vec rows', async () => {
    const db = openDb(':memory:')
    const id = await insertCapture(db, { content: 'bye', source: { type: 'web' } })
    deleteCapture(db, id)
    expect(getCapture(db, id)).toBeNull()
    const fts = db.prepare('SELECT count(*) AS c FROM captures_fts WHERE capture_id = ?').get(id) as { c: number }
    const vec = db.prepare('SELECT count(*) AS c FROM vec_captures WHERE capture_id = ?').get(id) as { c: number }
    expect(fts.c).toBe(0)
    expect(vec.c).toBe(0)
    db.close()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd app && npx vitest run test/capture.service.test.ts`
Expected: FAIL — cannot find module `../src/capture.service.js`.

- [ ] **Step 3: Implement**

```typescript
// app/src/capture.service.ts
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
  db.prepare('INSERT INTO vec_captures (capture_id, embedding) VALUES (?, ?)').run(id, JSON.stringify(vector))
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
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd app && npx vitest run test/capture.service.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/capture.service.ts app/test/capture.service.test.ts
git commit -m "feat: capture service with fts + vec indexing"
```

---

## Task 6: Search service

**Files:** Create `app/src/search.service.ts`, Test `app/test/search.service.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// app/test/search.service.test.ts
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
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd app && npx vitest run test/search.service.test.ts`
Expected: FAIL — cannot find module `../src/search.service.js`.

- [ ] **Step 3: Implement**

```typescript
// app/src/search.service.ts
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

export const keywordSearch = (db: Database.Database, query: string, limit: number): SearchResult[] => {
  const rows = db
    .prepare(
      `SELECT capture_id, -bm25(captures_fts) AS score
       FROM captures_fts WHERE captures_fts MATCH ? ORDER BY score DESC LIMIT ?`
    )
    .all(query, limit) as { capture_id: number; score: number }[]
  return hydrate(db, rows)
}

export const semanticSearch = async (
  db: Database.Database,
  query: string,
  limit: number
): Promise<SearchResult[]> => {
  const vector = await embed(query)
  const rows = db
    .prepare('SELECT capture_id, distance FROM vec_captures WHERE embedding MATCH ? ORDER BY distance LIMIT ?')
    .all(JSON.stringify(vector), limit) as { capture_id: number; distance: number }[]
  return hydrate(db, rows.map((r) => ({ capture_id: r.capture_id, score: 1 / (1 + r.distance) })))
}

export const hybridSearch = async (
  db: Database.Database,
  query: string,
  limit: number
): Promise<SearchResult[]> => {
  const [kw, sem] = await Promise.all([Promise.resolve(keywordSearch(db, query, limit)), semanticSearch(db, query, limit)])
  const best = new Map<number, SearchResult>()
  for (const r of [...kw, ...sem]) {
    const existing = best.get(r.capture.id)
    if (!existing || r.score > existing.score) best.set(r.capture.id, r)
  }
  return [...best.values()].sort((a, b) => b.score - a.score).slice(0, limit)
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd app && npx vitest run test/search.service.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/search.service.ts app/test/search.service.test.ts
git commit -m "feat: keyword, semantic, hybrid search"
```

---

## Task 7: Ask service

**Files:** Create `app/src/ask.service.ts`, Test `app/test/ask.service.test.ts`

The generator is injected so the test never calls a real model.

- [ ] **Step 1: Write the failing test**

```typescript
// app/test/ask.service.test.ts
import { describe, it, expect } from 'vitest'
import { openDb } from '../src/db.js'
import { insertCapture } from '../src/capture.service.js'
import { ask } from '../src/ask.service.js'

describe('ask.service', () => {
  it('retrieves relevant captures, grounds the prompt, returns citations', async () => {
    const db = openDb(':memory:')
    await insertCapture(db, { content: 'The deploy script runs migrations before starting the server', source: { type: 'web' } })
    await insertCapture(db, { content: 'Cats sleep 16 hours a day', source: { type: 'web' } })

    let prompt = ''
    const generate = async (p: string) => {
      prompt = p
      return 'Migrations run first.'
    }

    const result = await ask(db, 'what happens during deploy?', generate, 3)
    expect(prompt).toContain('migrations')
    expect(result.answer).toBe('Migrations run first.')
    expect(result.citations.length).toBeGreaterThan(0)
    expect(result.citations[0].content).toMatch(/deploy|migrations/)
    db.close()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd app && npx vitest run test/ask.service.test.ts`
Expected: FAIL — cannot find module `../src/ask.service.js`.

- [ ] **Step 3: Implement**

```typescript
// app/src/ask.service.ts
import Database from 'better-sqlite3'
import { Capture } from './types.js'
import { hybridSearch } from './search.service.js'

export type GenerateFn = (prompt: string) => Promise<string>

export interface AskResult {
  answer: string
  citations: Capture[]
}

const buildPrompt = (question: string, captures: Capture[]): string => {
  const context = captures
    .map((c, i) => `[${i + 1}] ${c.content}${c.note ? `\n(my note: ${c.note})` : ''}`)
    .join('\n\n')
  return `Answer using only these sources. Cite them by number. If they do not contain the answer, say so.\n\nSOURCES:\n${context}\n\nQUESTION: ${question}`
}

export const ask = async (
  db: Database.Database,
  question: string,
  generate: GenerateFn,
  k = 6
): Promise<AskResult> => {
  const hits = await hybridSearch(db, question, k)
  const citations = hits.map((h) => h.capture)
  const answer = await generate(buildPrompt(question, citations))
  return { answer, citations }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd app && npx vitest run test/ask.service.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/ask.service.ts app/test/ask.service.test.ts
git commit -m "feat: grounded ask (retrieval + injectable generator)"
```

---

## Task 8: Generator (Vercel AI SDK)

**Files:** Create `app/src/generator.ts`, Test `app/test/generator.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// app/test/generator.test.ts
import { describe, it, expect } from 'vitest'
import { makeGenerate } from '../src/generator.js'

describe('makeGenerate', () => {
  it('returns a callable for ollama', () => {
    const gen = makeGenerate({ provider: 'ollama', model: 'llama3.1', ollamaBaseURL: 'http://localhost:11434/api' })
    expect(typeof gen).toBe('function')
  })

  it('returns a callable for anthropic with a key', () => {
    const gen = makeGenerate({
      provider: 'anthropic',
      model: 'claude-sonnet-5',
      anthropicApiKey: 'sk-test',
      ollamaBaseURL: 'http://localhost:11434/api'
    })
    expect(typeof gen).toBe('function')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd app && npx vitest run test/generator.test.ts`
Expected: FAIL — cannot find module `../src/generator.js`.

- [ ] **Step 3: Implement**

```typescript
// app/src/generator.ts
import { generateText } from 'ai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createOllama } from 'ollama-ai-provider'
import { GenerateFn } from './ask.service.js'

interface AiConfig {
  provider: 'anthropic' | 'ollama'
  model: string
  anthropicApiKey?: string
  ollamaBaseURL: string
}

// Provider choice is config only; calling code is identical.
export const makeGenerate = (ai: AiConfig): GenerateFn => {
  const model =
    ai.provider === 'anthropic'
      ? createAnthropic({ apiKey: ai.anthropicApiKey })(ai.model)
      : createOllama({ baseURL: ai.ollamaBaseURL })(ai.model)
  return async (prompt: string) => {
    const { text } = await generateText({ model, prompt })
    return text
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd app && npx vitest run test/generator.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/generator.ts app/test/generator.test.ts
git commit -m "feat: provider-agnostic generator via Vercel AI SDK"
```

---

## Task 9: Middleware + controllers + routes + server

**Files:** Create `app/src/middleware/require-token.ts`, `app/src/routes/capture/capture.controller.ts`, `app/src/routes/search/search.controller.ts`, `app/src/routes/ask/ask.controller.ts`, `app/src/routes.ts`, `app/src/server.ts`, Test `app/test/server.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// app/test/server.test.ts
import { describe, it, expect } from 'vitest'
import { openDb } from '../src/db.js'
import { buildServer } from '../src/server.js'

const TOKEN = 'test-token'
const makeServer = () => {
  const db = openDb(':memory:')
  const app = buildServer(db, async () => 'stub answer', TOKEN)
  return app.listen(0)
}

describe('server', () => {
  it('rejects /capture without the token (401)', async () => {
    const server = makeServer()
    const { port } = server.address() as { port: number }
    const res = await fetch(`http://localhost:${port}/capture`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content: 'x', source: { type: 'web' } })
    })
    expect(res.status).toBe(401)
    server.close()
  })

  it('accepts a capture with the token, then finds it via search', async () => {
    const server = makeServer()
    const { port } = server.address() as { port: number }
    const base = `http://localhost:${port}`
    const headers = { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` }
    const cap = await fetch(`${base}/capture`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ content: 'sourdough fermentation tips', source: { type: 'web' } })
    })
    expect(cap.status).toBe(201)
    const search = await fetch(`${base}/search?q=sourdough&mode=keyword`, { headers })
    const results = (await search.json()) as { capture: { content: string } }[]
    expect(results[0].capture.content).toContain('sourdough')
    server.close()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd app && npx vitest run test/server.test.ts`
Expected: FAIL — cannot find module `../src/server.js`.

- [ ] **Step 3a: `app/src/middleware/require-token.ts`**

```typescript
import { Request, Response, NextFunction } from 'express'
import { httpErrors, Reason, throwHttpError } from '../utils/http-errors.js'

export const requireToken =
  (token: string) =>
  (req: Request, res: Response, next: NextFunction): void => {
    const auth = req.header('authorization') || ''
    if (auth !== `Bearer ${token}`) {
      throwHttpError(httpErrors.unauthorized, Reason.Unauthorized, res)
      return
    }
    next()
  }
```

- [ ] **Step 3b: `app/src/routes/capture/capture.controller.ts`**

```typescript
import { Router } from 'express'
import { object, string, array } from 'yup'
import Database from 'better-sqlite3'
import { httpErrors, Reason, throwHttpError } from '../../utils/http-errors.js'
import { insertCapture, listCaptures } from '../../capture.service.js'
import { CaptureInput } from '../../types.js'

const CaptureSchema = object({
  content: string().trim().required(),
  contextText: string().trim(),
  note: string().trim(),
  source: object({ type: string().oneOf(['web', 'app']).required() }).required(),
  screenshot: string(),
  tags: array(string()),
  capturedAt: string()
})

export const captureController = (db: Database.Database): Router => {
  const router = Router()

  router.post('/', async (req, res) => {
    let body
    try {
      body = await CaptureSchema.validate(req.body, { abortEarly: true, stripUnknown: true })
    } catch {
      throwHttpError(httpErrors.badRequest, Reason.MissingOrInvalidFields, res)
      return
    }
    const id = await insertCapture(db, body as unknown as CaptureInput)
    res.status(201).json({ id })
  })

  router.get('/', (_req, res) => res.json(listCaptures(db)))

  return router
}
```

- [ ] **Step 3c: `app/src/routes/search/search.controller.ts`**

```typescript
import { Router } from 'express'
import Database from 'better-sqlite3'
import { keywordSearch, semanticSearch, hybridSearch } from '../../search.service.js'

export const searchController = (db: Database.Database): Router => {
  const router = Router()

  router.get('/', async (req, res) => {
    const { q = '', mode = 'hybrid', limit = '20' } = req.query as {
      q?: string
      mode?: string
      limit?: string
    }
    const n = Number(limit)
    if (!q) {
      res.json([])
      return
    }
    if (mode === 'keyword') {
      res.json(keywordSearch(db, q, n))
      return
    }
    if (mode === 'semantic') {
      res.json(await semanticSearch(db, q, n))
      return
    }
    res.json(await hybridSearch(db, q, n))
  })

  return router
}
```

- [ ] **Step 3d: `app/src/routes/ask/ask.controller.ts`**

```typescript
import { Router } from 'express'
import Database from 'better-sqlite3'
import { ask, GenerateFn } from '../../ask.service.js'

export const askController = (db: Database.Database, generate: GenerateFn): Router => {
  const router = Router()

  router.post('/', async (req, res) => {
    const { question = '' } = req.body as { question?: string }
    res.json(await ask(db, question, generate))
  })

  return router
}
```

- [ ] **Step 3e: `app/src/routes.ts`**

```typescript
import { Application, Router } from 'express'
import Database from 'better-sqlite3'
import { GenerateFn } from './ask.service.js'
import { requireToken } from './middleware/require-token.js'
import { captureController } from './routes/capture/capture.controller.js'
import { searchController } from './routes/search/search.controller.js'
import { askController } from './routes/ask/ask.controller.js'

export const routes = (
  app: Application,
  db: Database.Database,
  generate: GenerateFn,
  token: string
): void => {
  const api = Router()
  api.use(requireToken(token))
  api.use('/capture', captureController(db))
  api.use('/search', searchController(db))
  api.use('/ask', askController(db, generate))
  app.use('/', api)
}
```

- [ ] **Step 3f: `app/src/server.ts`**

```typescript
import express, { Application } from 'express'
import Database from 'better-sqlite3'
import { GenerateFn } from './ask.service.js'
import { errorHandler } from './utils/http-errors.js'
import { routes } from './routes.js'

export const buildServer = (db: Database.Database, generate: GenerateFn, token: string): Application => {
  const app = express()
  app.use(express.json({ limit: '25mb' }))
  routes(app, db, generate, token)
  app.use(errorHandler)
  return app
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd app && npx vitest run test/server.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/middleware app/src/routes app/src/routes.ts app/src/server.ts app/test/server.test.ts
git commit -m "feat: token-guarded HTTP API (capture/search/ask)"
```

---

## Task 10: Entry point

**Files:** Create `app/src/index.ts`

- [ ] **Step 1: `app/src/index.ts`**

```typescript
import { SERVER, DB, AI } from './constants.js'
import { openDb } from './db.js'
import { makeGenerate } from './generator.js'
import { buildServer } from './server.js'

if (!SERVER.token) {
  console.error('CANVAS_TOKEN is required')
  process.exit(1)
}

const db = openDb(DB.path)
const app = buildServer(db, makeGenerate(AI), SERVER.token)
app.listen(SERVER.port, () => console.log(`engine on http://localhost:${SERVER.port}`))
```

- [ ] **Step 2: Smoke test**

Run: `cd app && CANVAS_TOKEN=dev CANVAS_DB=:memory: npx tsx src/index.ts`
Expected: prints `engine on http://localhost:7645`. In another terminal:
```bash
curl -s -XPOST http://localhost:7645/capture -H 'authorization: Bearer dev' -H 'content-type: application/json' -d '{"content":"hello","source":{"type":"web"}}'
```
Expected: `{"id":1}`. Stop the server with Ctrl-C.

- [ ] **Step 3: Commit**

```bash
git add app/src/index.ts
git commit -m "feat: engine entry point"
```

---

## Task 11: Full suite + typecheck

- [ ] **Step 1:** `cd app && npm test` → all pass.
- [ ] **Step 2:** `cd app && npm run typecheck` → no errors.
- [ ] **Step 3:** `git add -A && git commit -m "test: phase 1a engine green"`

---

## Self-review notes / next plans

- **Spec coverage (Phase 1a):** capture intake + token trust boundary (Task 9), corpus store (Task 5), local embeddings (Task 4), hybrid retrieval (Task 6), grounded ask with citations (Task 7), Claude/Ollama by config (Task 8). ✅
- **Deferred to later plans:** Electron shell + React search/ask UI; canvases + living document + collation/merge + provenance (Phase 2); screen OCR (Phase 3); markdown export (small, add when needed).
- **Plan 1b (capturer extension)** POSTs to `/capture` with the shared token: box-draw/text-select → DOM text + `#:~:text=` anchor + screenshot; offline queue. Uses the standard semicolon dialect (browser code), not the desktop dialect above.
```
