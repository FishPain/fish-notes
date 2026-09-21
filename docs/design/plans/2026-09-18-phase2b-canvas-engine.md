# Phase 2b — Canvas + Collation Engine — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add canvases to the engine: a per-topic living document the LLM collates from the corpus, where segments you edit are locked and preserved across refreshes, and every AI segment cites real captures.

**Architecture:** Extends the Phase-1a engine under `app/src`. A `canvases` table stores each canvas's ordered **segments** as JSON (`{ id, heading, text, origin: 'ai'|'user', citations: number[] }`). `collate` retrieves top-k relevant captures (reusing `hybridSearch`), asks an **injected** generator for fresh AI segments grounded in them, validates citations against the retrieved ids, and merges — keeping `user` segments verbatim and replacing `ai` segments. Headless + fully tested; the TipTap canvas UI is Phase 2c.

**Tech Stack:** (existing) better-sqlite3, sqlite-vec, Vercel AI SDK, express, vitest. Desktop dialect: single quotes, **no semicolons**, no trailing commas, 2-space, arrow-const, named exports, no `any`, no `import type`, `*.service.ts`/`*.controller.ts`, error contract via `throwHttpError`.

> **ABI reminder:** run everything on Node 24; `npm test` auto-rebuilds `better-sqlite3` for the Node ABI. Don't run `rebuild:electron` during this plan.

---

## File Structure (additions)

```
app/src/
  types.ts               # + Segment, Canvas, RawSegment
  db.ts                  # + canvases table in SCHEMA
  canvas.service.ts      # createCanvas/getCanvas/listCanvases/saveDoc/updateSegment
  collate.service.ts     # collate(db, canvasId, generateSegments)
  collate-generator.ts   # makeSegmentGenerator(AI) -> GenerateSegmentsFn (AI SDK JSON)
  routes/canvas/canvas.controller.ts  # CRUD + PATCH segment + POST /collate
  routes.ts              # + mount canvasController
app/test/
  canvas.service.test.ts
  collate.service.test.ts
  canvas.server.test.ts
```

---

## Task 1: Types + canvases table

**Files:** Modify `app/src/types.ts`, `app/src/db.ts`

- [ ] **Step 1: Add to `app/src/types.ts`** (append)

```typescript
export interface Segment {
  id: string
  heading: string
  text: string
  origin: 'ai' | 'user'
  citations: number[]
}

export interface Canvas {
  id: number
  title: string
  doc: Segment[]
  updatedAt: string
}

// What the generator returns before validation/merge (no id/origin yet).
export interface RawSegment {
  heading: string
  text: string
  citations: number[]
}
```

- [ ] **Step 2: Add the `canvases` table to `SCHEMA` in `app/src/db.ts`**

Add this string to the `SCHEMA` array (after the existing entries):

```typescript
  `CREATE TABLE IF NOT EXISTS canvases (
     id        INTEGER PRIMARY KEY AUTOINCREMENT,
     title     TEXT NOT NULL,
     doc       TEXT NOT NULL DEFAULT '[]',
     updatedAt TEXT NOT NULL
   )`
```

- [ ] **Step 3: Verify migration** — write a quick test `app/test/canvas-schema.test.ts`:

```typescript
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
```

Run: `cd app && npm test -- test/canvas-schema.test.ts` → PASS (npm test auto-rebuilds for Node ABI).

- [ ] **Step 4: Commit**

```bash
git add app/src/types.ts app/src/db.ts app/test/canvas-schema.test.ts
git commit -m "feat: canvas types + canvases table"
```

---

## Task 2: Canvas service

**Files:** Create `app/src/canvas.service.ts`, Test `app/test/canvas.service.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// app/test/canvas.service.test.ts
import { describe, it, expect } from 'vitest'
import { openDb } from '../src/db.js'
import { createCanvas, getCanvas, listCanvases, saveDoc, updateSegment } from '../src/canvas.service.js'
import { Segment } from '../src/types.js'

const seg = (over: Partial<Segment>): Segment => ({
  id: 'x',
  heading: '',
  text: 't',
  origin: 'ai',
  citations: [],
  ...over
})

describe('canvas.service', () => {
  it('creates, lists, and reads a canvas with an empty doc', () => {
    const db = openDb(':memory:')
    const id = createCanvas(db, 'New Agent')
    expect(listCanvases(db).map((c) => c.title)).toContain('New Agent')
    const c = getCanvas(db, id)!
    expect(c.title).toBe('New Agent')
    expect(c.doc).toEqual([])
    db.close()
  })

  it('saves a doc and reads it back', () => {
    const db = openDb(':memory:')
    const id = createCanvas(db, 'C')
    saveDoc(db, id, [seg({ id: 's1', text: 'hello' })])
    expect(getCanvas(db, id)!.doc[0].text).toBe('hello')
    db.close()
  })

  it('updateSegment locks the segment as user-origin with new text', () => {
    const db = openDb(':memory:')
    const id = createCanvas(db, 'C')
    saveDoc(db, id, [seg({ id: 's1', origin: 'ai', text: 'ai text' })])
    updateSegment(db, id, 's1', 'my edit')
    const s = getCanvas(db, id)!.doc[0]
    expect(s.origin).toBe('user')
    expect(s.text).toBe('my edit')
    db.close()
  })
})
```

- [ ] **Step 2: Run, confirm fail:** `cd app && npm test -- test/canvas.service.test.ts`

- [ ] **Step 3: Implement `app/src/canvas.service.ts`**

```typescript
import Database from 'better-sqlite3'
import { DateTime } from 'luxon'
import { Canvas, Segment } from './types.js'

interface CanvasRow {
  id: number
  title: string
  doc: string
  updatedAt: string
}

const rowToCanvas = (row: CanvasRow): Canvas => ({
  id: row.id,
  title: row.title,
  doc: JSON.parse(row.doc),
  updatedAt: row.updatedAt
})

export const createCanvas = (db: Database.Database, title: string): number => {
  const info = db
    .prepare('INSERT INTO canvases (title, doc, updatedAt) VALUES (?, ?, ?)')
    .run(title, '[]', DateTime.now().toISO())
  return Number(info.lastInsertRowid)
}

export const getCanvas = (db: Database.Database, id: number): Canvas | null => {
  const row = db.prepare('SELECT * FROM canvases WHERE id = ?').get(id) as CanvasRow | undefined
  return row ? rowToCanvas(row) : null
}

export const listCanvases = (db: Database.Database): Canvas[] =>
  (db.prepare('SELECT * FROM canvases ORDER BY updatedAt DESC').all() as CanvasRow[]).map(rowToCanvas)

export const saveDoc = (db: Database.Database, id: number, doc: Segment[]): void => {
  db.prepare('UPDATE canvases SET doc = ?, updatedAt = ? WHERE id = ?').run(
    JSON.stringify(doc),
    DateTime.now().toISO(),
    id
  )
}

// Editing a segment locks it as the user's ground truth so refresh won't touch it.
export const updateSegment = (db: Database.Database, id: number, segmentId: string, text: string): void => {
  const canvas = getCanvas(db, id)
  if (!canvas) return
  const doc = canvas.doc.map((s) =>
    s.id === segmentId ? { ...s, text, origin: 'user' as const } : s
  )
  saveDoc(db, id, doc)
}
```

- [ ] **Step 4: Run, confirm pass.** `cd app && npm test -- test/canvas.service.test.ts`

- [ ] **Step 5: Commit**

```bash
git add app/src/canvas.service.ts app/test/canvas.service.test.ts
git commit -m "feat: canvas service (crud + segment edit-lock)"
```

---

## Task 3: Collate service (retrieve → synthesize → merge)

**Files:** Create `app/src/collate.service.ts`, Test `app/test/collate.service.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// app/test/collate.service.test.ts
import { describe, it, expect } from 'vitest'
import { openDb } from '../src/db.js'
import { insertCapture } from '../src/capture.service.js'
import { createCanvas, saveDoc, getCanvas } from '../src/canvas.service.js'
import { collate } from '../src/collate.service.js'
import { RawSegment, Segment } from '../src/types.js'

describe('collate', () => {
  it('preserves user-locked segments, replaces AI segments, drops hallucinated citations', async () => {
    const db = openDb(':memory:')
    const c1 = await insertCapture(db, { content: 'Kubernetes networking uses a flat pod network', source: { type: 'web' } })
    await insertCapture(db, { content: 'unrelated sourdough note', source: { type: 'web' } })

    const canvasId = createCanvas(db, 'Kubernetes')
    const locked: Segment = { id: 'u1', heading: 'Decision', text: 'We use the event bus', origin: 'user', citations: [] }
    const oldAi: Segment = { id: 'a1', heading: 'Old', text: 'stale ai text', origin: 'ai', citations: [999] }
    saveDoc(db, canvasId, [locked, oldAi])

    // Fake generator returns one fresh AI section citing a real id + a hallucinated one.
    const generateSegments = async (): Promise<RawSegment[]> => [
      { heading: 'Overview', text: 'Pods share a flat network', citations: [c1, 999] }
    ]

    const doc = await collate(db, canvasId, generateSegments)

    // user-locked segment survives verbatim
    const user = doc.find((s) => s.id === 'u1')!
    expect(user.text).toBe('We use the event bus')
    expect(user.origin).toBe('user')
    // stale AI segment replaced
    expect(doc.find((s) => s.id === 'a1')).toBeUndefined()
    // new AI segment present, hallucinated citation 999 dropped, real id kept
    const ai = doc.find((s) => s.origin === 'ai')!
    expect(ai.heading).toBe('Overview')
    expect(ai.citations).toEqual([c1])
    // persisted
    expect(getCanvas(db, canvasId)!.doc.length).toBe(doc.length)
    db.close()
  })
})
```

- [ ] **Step 2: Run, confirm fail:** `cd app && npm test -- test/collate.service.test.ts`

- [ ] **Step 3: Implement `app/src/collate.service.ts`**

```typescript
import Database from 'better-sqlite3'
import { randomUUID } from 'crypto'
import { RawSegment, Segment } from './types.js'
import { getCanvas, saveDoc } from './canvas.service.js'
import { hybridSearch } from './search.service.js'

export type GenerateSegmentsFn = (
  topic: string,
  sources: { id: number; content: string }[],
  lockedText: string[]
) => Promise<RawSegment[]>

const RETRIEVE_K = 12

// Retrieve relevant captures for the canvas, ask the generator for fresh AI
// segments grounded in them, then merge: keep user-locked segments (re-anchored
// at their original positions), replace AI segments, and keep only citations that
// point at retrieved captures (drop hallucinations).
export const collate = async (
  db: Database.Database,
  canvasId: number,
  generateSegments: GenerateSegmentsFn
): Promise<Segment[]> => {
  const canvas = getCanvas(db, canvasId)
  if (!canvas) return []

  const hits = await hybridSearch(db, canvas.title, RETRIEVE_K)
  const sources = hits.map((h) => ({ id: h.capture.id, content: h.capture.content }))
  const allowed = new Set(sources.map((s) => s.id))

  const locked = canvas.doc
    .map((s, index) => ({ s, index }))
    .filter((x) => x.s.origin === 'user')

  const raw = await generateSegments(
    canvas.title,
    sources,
    locked.map((x) => x.s.text)
  )

  const aiSegments: Segment[] = raw.map((r) => ({
    id: randomUUID(),
    heading: r.heading,
    text: r.text,
    origin: 'ai',
    citations: r.citations.filter((id) => allowed.has(id))
  }))

  // Re-insert locked segments at their original indices (clamped) among AI ones.
  const doc = [...aiSegments]
  for (const { s, index } of locked) {
    doc.splice(Math.min(index, doc.length), 0, s)
  }

  saveDoc(db, canvasId, doc)
  return doc
}
```

- [ ] **Step 4: Run, confirm pass.** `cd app && npm test -- test/collate.service.test.ts`

- [ ] **Step 5: Commit**

```bash
git add app/src/collate.service.ts app/test/collate.service.test.ts
git commit -m "feat: collate service (retrieve + merge preserving locked segments)"
```

---

## Task 4: Real segment generator (Vercel AI SDK, JSON)

**Files:** Create `app/src/collate-generator.ts`, Test `app/test/collate-generator.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// app/test/collate-generator.test.ts
import { describe, it, expect } from 'vitest'
import { makeSegmentGenerator } from '../src/collate-generator.js'

describe('makeSegmentGenerator', () => {
  it('returns a callable for the ollama provider', () => {
    const gen = makeSegmentGenerator({ provider: 'ollama', model: 'llama3.1', ollamaBaseURL: 'http://localhost:11434/api' })
    expect(typeof gen).toBe('function')
  })

  it('parses a JSON array of segments from the model text', async () => {
    // Inject a fake text generator to test parsing without a network call.
    const fakeText = async () =>
      '```json\n[{"heading":"H","text":"T","citations":[1,2]}]\n```'
    const gen = makeSegmentGenerator(
      { provider: 'ollama', model: 'x', ollamaBaseURL: 'http://localhost:11434/api' },
      fakeText
    )
    const segs = await gen('topic', [{ id: 1, content: 'c' }], [])
    expect(segs).toEqual([{ heading: 'H', text: 'T', citations: [1, 2] }])
  })

  it('returns [] when the model text is not valid JSON', async () => {
    const gen = makeSegmentGenerator(
      { provider: 'ollama', model: 'x', ollamaBaseURL: 'http://localhost:11434/api' },
      async () => 'sorry I cannot'
    )
    expect(await gen('t', [], [])).toEqual([])
  })
})
```

- [ ] **Step 2: Run, confirm fail:** `cd app && npm test -- test/collate-generator.test.ts`

- [ ] **Step 3: Implement `app/src/collate-generator.ts`**

```typescript
import { generateText } from 'ai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createOllama } from 'ollama-ai-provider'
import { RawSegment } from './types.js'
import { GenerateSegmentsFn } from './collate.service.js'

interface AiConfig {
  provider: 'anthropic' | 'ollama'
  model: string
  anthropicApiKey?: string
  ollamaBaseURL: string
}

type TextFn = (prompt: string) => Promise<string>

const buildPrompt = (
  topic: string,
  sources: { id: number; content: string }[],
  lockedText: string[]
): string => {
  const src = sources.map((s) => `[${s.id}] ${s.content}`).join('\n')
  const mine = lockedText.length ? `\n\nAlready-written sections to COMPLEMENT (do not repeat or contradict):\n- ${lockedText.join('\n- ')}` : ''
  return `You are collating research notes on "${topic}" into a brief.
Use ONLY the numbered sources. Return a JSON array of sections, each:
{ "heading": string, "text": string, "citations": number[] }  // citations are source numbers you used
Return ONLY the JSON array.${mine}

SOURCES:\n${src}`
}

// Extract the first JSON array from model text (handles ```json fences / prose).
const parseSegments = (text: string): RawSegment[] => {
  const start = text.indexOf('[')
  const end = text.lastIndexOf(']')
  if (start === -1 || end === -1 || end < start) return []
  try {
    const parsed = JSON.parse(text.slice(start, end + 1))
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((s) => s && typeof s.heading === 'string' && typeof s.text === 'string')
      .map((s) => ({
        heading: s.heading,
        text: s.text,
        citations: Array.isArray(s.citations) ? s.citations.filter((n: unknown) => typeof n === 'number') : []
      }))
  } catch {
    return []
  }
}

// textFn is injectable for testing; production builds it from the AI SDK.
export const makeSegmentGenerator = (ai: AiConfig, textFn?: TextFn): GenerateSegmentsFn => {
  const generate: TextFn =
    textFn ??
    (async (prompt: string) => {
      const model =
        ai.provider === 'anthropic'
          ? createAnthropic({ apiKey: ai.anthropicApiKey })(ai.model)
          : createOllama({ baseURL: ai.ollamaBaseURL })(ai.model)
      const { text } = await generateText({ model, prompt })
      return text
    })

  return async (topic, sources, lockedText) =>
    parseSegments(await generate(buildPrompt(topic, sources, lockedText)))
}
```

- [ ] **Step 4: Run, confirm pass.** `cd app && npm test -- test/collate-generator.test.ts`

- [ ] **Step 5: Commit**

```bash
git add app/src/collate-generator.ts app/test/collate-generator.test.ts
git commit -m "feat: segment generator via Vercel AI SDK with defensive JSON parse"
```

---

## Task 5: Canvas HTTP routes

**Files:** Create `app/src/routes/canvas/canvas.controller.ts`; Modify `app/src/routes.ts`, `app/src/server.ts` (pass a segment generator); Test `app/test/canvas.server.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// app/test/canvas.server.test.ts
import { describe, it, expect } from 'vitest'
import { openDb } from '../src/db.js'
import { buildServer } from '../src/server.js'

const TOKEN = 'test-token'
const makeServer = () => {
  const db = openDb(':memory:')
  // stub ask generator + stub segment generator (one AI section, no citations)
  const app = buildServer(db, async () => 'stub', TOKEN, async () => [{ heading: 'H', text: 'T', citations: [] }])
  return app.listen(0)
}

describe('canvas routes', () => {
  it('creates a canvas, lists it, collates it', async () => {
    const server = makeServer()
    const { port } = server.address() as { port: number }
    const base = `http://localhost:${port}`
    const headers = { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` }

    const created = await (
      await fetch(`${base}/canvas`, { method: 'POST', headers, body: JSON.stringify({ title: 'New Agent' }) })
    ).json()
    expect(created.id).toBeGreaterThan(0)

    const list = (await (await fetch(`${base}/canvas`, { headers })).json()) as { title: string }[]
    expect(list[0].title).toBe('New Agent')

    const collated = (await (
      await fetch(`${base}/canvas/${created.id}/collate`, { method: 'POST', headers })
    ).json()) as { doc: { heading: string; origin: string }[] }
    expect(collated.doc[0].heading).toBe('H')
    expect(collated.doc[0].origin).toBe('ai')

    server.close()
  })
})
```

- [ ] **Step 2: Run, confirm fail:** `cd app && npm test -- test/canvas.server.test.ts`

- [ ] **Step 3a: Create `app/src/routes/canvas/canvas.controller.ts`**

```typescript
import { Router } from 'express'
import { object, string } from 'yup'
import Database from 'better-sqlite3'
import { httpErrors, Reason, throwHttpError } from '../../utils/http-errors.js'
import { asyncHandler } from '../../utils/async-handler.js'
import { createCanvas, listCanvases, getCanvas, updateSegment } from '../../canvas.service.js'
import { collate, GenerateSegmentsFn } from '../../collate.service.js'

const TitleSchema = object({ title: string().trim().required() })

export const canvasController = (db: Database.Database, generateSegments: GenerateSegmentsFn): Router => {
  const router = Router()

  router.post(
    '/',
    asyncHandler(async (req, res) => {
      let body
      try {
        body = await TitleSchema.validate(req.body, { abortEarly: true, stripUnknown: true })
      } catch {
        throwHttpError(httpErrors.badRequest, Reason.MissingOrInvalidFields, res)
        return
      }
      res.status(201).json({ id: createCanvas(db, body.title) })
    })
  )

  router.get('/', (_req, res) => res.json(listCanvases(db)))

  router.get('/:id', (req, res) => {
    const canvas = getCanvas(db, Number(req.params.id))
    return canvas ? res.json(canvas) : res.status(404).json({ error: 'not found' })
  })

  router.patch('/:id/segments/:segmentId', (req, res) => {
    updateSegment(db, Number(req.params.id), req.params.segmentId, String(req.body.text ?? ''))
    res.json(getCanvas(db, Number(req.params.id)))
  })

  router.post(
    '/:id/collate',
    asyncHandler(async (req, res) => {
      const doc = await collate(db, Number(req.params.id), generateSegments)
      res.json({ doc })
    })
  )

  return router
}
```

- [ ] **Step 3b: Update `app/src/routes.ts`** — thread a `generateSegments` param and mount the controller.

Change the `routes` signature and body to:

```typescript
import { Application, Router } from 'express'
import Database from 'better-sqlite3'
import { GenerateFn } from './ask.service.js'
import { GenerateSegmentsFn } from './collate.service.js'
import { requireToken } from './middleware/require-token.js'
import { captureController } from './routes/capture/capture.controller.js'
import { searchController } from './routes/search/search.controller.js'
import { askController } from './routes/ask/ask.controller.js'
import { canvasController } from './routes/canvas/canvas.controller.js'

export const routes = (
  app: Application,
  db: Database.Database,
  generate: GenerateFn,
  token: string,
  generateSegments: GenerateSegmentsFn
): void => {
  const api = Router()
  api.use(requireToken(token))
  api.use('/capture', captureController(db))
  api.use('/search', searchController(db))
  api.use('/ask', askController(db, generate))
  api.use('/canvas', canvasController(db, generateSegments))
  app.use('/', api)
}
```

- [ ] **Step 3c: Update `app/src/server.ts`** — add the `generateSegments` param and pass it through.

```typescript
import express, { Application, Request, Response, NextFunction } from 'express'
import Database from 'better-sqlite3'
import { GenerateFn } from './ask.service.js'
import { GenerateSegmentsFn } from './collate.service.js'
import { errorHandler } from './utils/http-errors.js'
import { routes } from './routes.js'

const cors = (_req: Request, res: Response, next: NextFunction): void => {
  res.header('access-control-allow-origin', '*')
  res.header('access-control-allow-headers', 'authorization, content-type')
  res.header('access-control-allow-methods', 'GET, POST, PATCH, DELETE, OPTIONS')
  next()
}

export const buildServer = (
  db: Database.Database,
  generate: GenerateFn,
  token: string,
  generateSegments: GenerateSegmentsFn
): Application => {
  const app = express()
  app.use(cors)
  app.options('*', (_req, res) => res.sendStatus(204))
  app.use(express.json({ limit: '25mb' }))
  routes(app, db, generate, token, generateSegments)
  app.use(errorHandler)
  return app
}
```

- [ ] **Step 3d: Update the two existing `buildServer` callers** so the app still compiles:
  - `app/src/index.ts`: add a segment generator — `import { makeSegmentGenerator } from './collate-generator.js'` and pass `makeSegmentGenerator(AI)` as the 4th arg to `buildServer`.
  - `app/electron/main.ts`: same — `import { makeSegmentGenerator } from '../src/collate-generator.js'` and pass `makeSegmentGenerator(AI)` as the 4th arg.
  - Existing `app/test/server.test.ts`'s `makeServer` calls `buildServer(db, async () => 'stub answer', TOKEN)` — add a 4th arg `async () => []` so those tests still compile.

- [ ] **Step 4: Run the whole suite, confirm pass.** `cd app && npm test`

- [ ] **Step 5: Typecheck + commit**

```bash
cd app && npx tsc --noEmit
git add app/src/routes/canvas app/src/routes.ts app/src/server.ts app/src/index.ts app/electron/main.ts app/test/canvas.server.test.ts app/test/server.test.ts
git commit -m "feat: canvas HTTP routes (crud + segment edit + collate)"
```

---

## Task 6: Full suite + typecheck

- [ ] **Step 1:** `cd app && npm test` → all pass (Node ABI).
- [ ] **Step 2:** `cd app && npx tsc --noEmit` → exit 0.
- [ ] **Step 3:** `git add -A && git commit -m "test: phase 2b canvas engine green"` (if anything to commit).

---

## Self-review notes / next plan

- **Spec coverage (2b):** canvases (Task 1–2), living-document segments with edit-locks (Task 2), collate = retrieve→synthesize→merge preserving locked segments (Task 3), grounded citations validated against retrieved ids (Task 3), Claude/Ollama by config for synthesis (Task 4), HTTP surface for the UI (Task 5). ✅
- **v1 simplification (per spec):** provenance/merge is **segment-level**, not true word-level; the "Refresh" is manual (a `POST /collate` call). Word-level diffing and auto-nudges are later refinements — mark with a `ponytail:` comment in `collate.service.ts` if you want it tracked.
- **Deferred to 2c:** the TipTap canvas editor (render segments with `origin` tints + inline citation chips + a Refresh button + span popover), a canvas list in a left rail, and mapping edits back through `PATCH /canvas/:id/segments/:segmentId`.
- **Risk:** local models may return non-JSON; `parseSegments` degrades to `[]` (no crash) — a canvas just won't gain AI segments until the model complies. Consider `generateObject` (AI SDK structured output) as a later hardening.
```
