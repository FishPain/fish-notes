# TipTap Note-Canvas (AI contributes, never overwrites) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the canvas into a real, freely-editable rich-text note where AI *contributes* grounded content by insertion (with attribution + citations) rather than regenerating and merging. No locks, no clobbering.

**Architecture:** The canvas document is opaque **ProseMirror/TipTap JSON** stored by the engine and **autosaved** by the app (`PATCH /canvas/:id`). AI content comes from `POST /canvas/:id/draft`, which reuses the existing retrieval + grounded generation to return sections (heading/text/validated-citations) that the app **inserts** into the note as `aiOrigin`-tinted text with inline `citation` marks. Editing is normal note editing; AI never rewrites the doc. This replaces the segment/collate/merge model from Phase 2b.

**Tech Stack:** existing engine (better-sqlite3, express, AI SDK). UI adds TipTap: `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/core`. Desktop dialect (single quotes, no semicolons, no trailing commas), MUI `sx`, TanStack Query. `npm test` runs on Node 24 (auto-rebuilds better-sqlite3).

---

## What changes vs Phase 2b

- **Removed:** `Segment`/`RawSegment`-as-stored-doc, `updateSegment` (segment edit-lock), the merge in `collate.service`.
- **Kept & reused:** retrieval (`hybridSearch`), grounded generation (`makeSegmentGenerator` returns `RawSegment[]` = `{heading,text,citations}`), citation validation, `collatedAt` + new-source count.
- **Canvas.doc** goes from `Segment[]` to an opaque JSON value (the TipTap doc).

---

## Task 1: Canvas doc becomes an opaque document + save endpoint

**Files:** `app/src/types.ts`, `app/src/canvas.service.ts`, `app/test/canvas.service.test.ts`

- [ ] **Step 1: Update `Canvas` in `types.ts`** — change `doc: Segment[]` to `doc: unknown` (the TipTap JSON). Keep `Segment`/`RawSegment` (still used by the draft generator).

```typescript
export interface Canvas {
  id: number
  title: string
  description: string
  doc: unknown
  updatedAt: string
  collatedAt: string
}
```

- [ ] **Step 2: Rewrite the failing test `app/test/canvas.service.test.ts`**

```typescript
import { describe, it, expect } from 'vitest'
import { openDb } from '../src/db.js'
import { createCanvas, getCanvas, listCanvases, saveDoc } from '../src/canvas.service.js'

describe('canvas.service', () => {
  it('creates a canvas with an empty doc and reads title/description back', () => {
    const db = openDb(':memory:')
    const id = createCanvas(db, 'New Agent', 'internal systems')
    expect(listCanvases(db).map((c) => c.title)).toContain('New Agent')
    const c = getCanvas(db, id)!
    expect(c.title).toBe('New Agent')
    expect(c.description).toBe('internal systems')
    expect(c.doc).toEqual({ type: 'doc', content: [] })
    db.close()
  })

  it('saves an arbitrary doc (opaque JSON) and reads it back', () => {
    const db = openDb(':memory:')
    const id = createCanvas(db, 'C')
    const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hi' }] }] }
    saveDoc(db, id, doc)
    expect(getCanvas(db, id)!.doc).toEqual(doc)
    db.close()
  })
})
```

- [ ] **Step 3: Run, confirm fail:** `cd app && npm test -- test/canvas.service.test.ts`

- [ ] **Step 4: Update `app/src/canvas.service.ts`** — `doc` is opaque JSON; drop `updateSegment`; default doc is an empty ProseMirror doc.

```typescript
import Database from 'better-sqlite3'
import { DateTime } from 'luxon'
import { Canvas } from './types.js'

const EMPTY_DOC = { type: 'doc', content: [] }

interface CanvasRow {
  id: number
  title: string
  description: string
  doc: string
  updatedAt: string
  collatedAt: string
}

const rowToCanvas = (row: CanvasRow): Canvas => ({
  id: row.id,
  title: row.title,
  description: row.description,
  doc: JSON.parse(row.doc),
  updatedAt: row.updatedAt,
  collatedAt: row.collatedAt
})

export const createCanvas = (db: Database.Database, title: string, description = ''): number => {
  const info = db
    .prepare('INSERT INTO canvases (title, description, doc, updatedAt) VALUES (?, ?, ?, ?)')
    .run(title, description, JSON.stringify(EMPTY_DOC), DateTime.now().toISO())
  return Number(info.lastInsertRowid)
}

export const getCanvas = (db: Database.Database, id: number): Canvas | null => {
  const row = db.prepare('SELECT * FROM canvases WHERE id = ?').get(id) as CanvasRow | undefined
  return row ? rowToCanvas(row) : null
}

export const listCanvases = (db: Database.Database): Canvas[] =>
  (db.prepare('SELECT * FROM canvases ORDER BY updatedAt DESC').all() as CanvasRow[]).map(rowToCanvas)

// The whole note doc is opaque JSON owned by the editor; we just persist it.
export const saveDoc = (db: Database.Database, id: number, doc: unknown): void => {
  db.prepare('UPDATE canvases SET doc = ?, updatedAt = ? WHERE id = ?').run(
    JSON.stringify(doc),
    DateTime.now().toISO(),
    id
  )
}

export const markCollated = (db: Database.Database, id: number): void => {
  db.prepare('UPDATE canvases SET collatedAt = ? WHERE id = ?').run(DateTime.now().toISO(), id)
}
```

- [ ] **Step 5: Run, confirm pass; commit**

```bash
cd app && npm test -- test/canvas.service.test.ts
git -C /Users/I576470/Documents/mynotes add app/src/types.ts app/src/canvas.service.ts app/test/canvas.service.test.ts
git -C /Users/I576470/Documents/mynotes commit -m "refactor: canvas doc is an opaque editor document (drop segment model)"
```

---

## Task 2: Draft service (retrieve + generate, no merge)

**Files:** Create `app/src/draft.service.ts`; delete `app/src/collate.service.ts`; rename test `app/test/collate.service.test.ts` → `app/test/draft.service.test.ts`

- [ ] **Step 1: Write the failing test `app/test/draft.service.test.ts`**

```typescript
import { describe, it, expect } from 'vitest'
import { openDb } from '../src/db.js'
import { insertCapture } from '../src/capture.service.js'
import { createCanvas, getCanvas } from '../src/canvas.service.js'
import { draftFromSources } from '../src/draft.service.js'
import { RawSegment } from '../src/types.js'

describe('draftFromSources', () => {
  it('returns grounded sections with hallucinated citations dropped, and stamps collatedAt', async () => {
    const db = openDb(':memory:')
    const c1 = await insertCapture(db, { content: 'Kubernetes uses a flat pod network', source: { type: 'web' } })
    const canvasId = createCanvas(db, 'Kubernetes')

    const generateSegments = async (): Promise<RawSegment[]> => [
      { heading: 'Overview', text: 'Pods share a flat network', citations: [c1, 999] }
    ]

    const sections = await draftFromSources(db, canvasId, generateSegments)
    expect(sections[0].heading).toBe('Overview')
    expect(sections[0].citations).toEqual([c1]) // 999 dropped
    expect(getCanvas(db, canvasId)!.collatedAt).not.toBe('')
    db.close()
  })
})
```

- [ ] **Step 2: Run, confirm fail:** `cd app && npm test -- test/draft.service.test.ts`

- [ ] **Step 3: Create `app/src/draft.service.ts`**

```typescript
import Database from 'better-sqlite3'
import { RawSegment } from './types.js'
import { getCanvas, markCollated } from './canvas.service.js'
import { hybridSearch } from './search.service.js'

export type GenerateSegmentsFn = (
  topic: string,
  sources: { id: number; content: string }[],
  lockedText: string[]
) => Promise<RawSegment[]>

const RETRIEVE_K = 12

// Retrieve relevant captures for the canvas topic and ask the generator for
// grounded sections. Returns them for the editor to INSERT (nothing is stored or
// merged here). Citations are filtered to retrieved captures (drop hallucinations).
export const draftFromSources = async (
  db: Database.Database,
  canvasId: number,
  generateSegments: GenerateSegmentsFn
): Promise<RawSegment[]> => {
  const canvas = getCanvas(db, canvasId)
  if (!canvas) return []

  const topic = [canvas.title, canvas.description].filter(Boolean).join(' — ')
  const hits = await hybridSearch(db, topic, RETRIEVE_K)
  const sources = hits.map((h) => ({ id: h.capture.id, content: h.capture.content }))
  const allowed = new Set(sources.map((s) => s.id))

  const raw = await generateSegments(topic, sources, [])
  markCollated(db, canvasId)

  return raw.map((r) => ({
    heading: r.heading,
    text: r.text,
    citations: [...new Set(r.citations.filter((id) => allowed.has(id)))]
  }))
}
```

- [ ] **Step 4: Delete the old merge service + test**

```bash
git -C /Users/I576470/Documents/mynotes rm app/src/collate.service.ts app/test/collate.service.test.ts
```

- [ ] **Step 5: Run, confirm pass; commit**

```bash
cd app && npm test -- test/draft.service.test.ts
git -C /Users/I576470/Documents/mynotes add app/src/draft.service.ts app/test/draft.service.test.ts
git -C /Users/I576470/Documents/mynotes commit -m "feat: draft service (retrieve + generate grounded sections to insert; no merge)"
```

---

## Task 3: Canvas routes — save doc + draft

**Files:** `app/src/routes/canvas/canvas.controller.ts`, `app/src/routes.ts`, `app/src/server.ts` (type import only), `app/test/canvas.server.test.ts`

- [ ] **Step 1: Update the failing test `app/test/canvas.server.test.ts`**

```typescript
import { describe, it, expect } from 'vitest'
import { openDb } from '../src/db.js'
import { buildServer } from '../src/server.js'

const TOKEN = 'test-token'
const makeServer = () => {
  const db = openDb(':memory:')
  const app = buildServer(db, async () => 'stub', TOKEN, async () => [{ heading: 'H', text: 'T', citations: [] }])
  return app.listen(0)
}

describe('canvas routes', () => {
  it('creates, saves the doc, and drafts', async () => {
    const server = makeServer()
    const { port } = server.address() as { port: number }
    const base = `http://localhost:${port}`
    const headers = { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` }

    const created = await (await fetch(`${base}/canvas`, { method: 'POST', headers, body: JSON.stringify({ title: 'New Agent' }) })).json()
    expect(created.id).toBeGreaterThan(0)

    const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'my note' }] }] }
    const saved = await fetch(`${base}/canvas/${created.id}`, { method: 'PATCH', headers, body: JSON.stringify({ doc }) })
    expect(saved.status).toBe(200)
    const got = await (await fetch(`${base}/canvas/${created.id}`, { headers })).json()
    expect(got.doc).toEqual(doc)

    const draft = await (await fetch(`${base}/canvas/${created.id}/draft`, { method: 'POST', headers })).json()
    expect(draft.sections[0].heading).toBe('H')

    server.close()
  })

  it('returns 404 for a missing canvas', async () => {
    const server = makeServer()
    const { port } = server.address() as { port: number }
    const res = await fetch(`http://localhost:${port}/canvas/9999`, { headers: { authorization: `Bearer ${TOKEN}` } })
    expect(res.status).toBe(404)
    server.close()
  })
})
```

- [ ] **Step 2: Run, confirm fail:** `cd app && npm test -- test/canvas.server.test.ts`

- [ ] **Step 3: Rewrite `app/src/routes/canvas/canvas.controller.ts`**

```typescript
import { Router } from 'express'
import { object, string } from 'yup'
import Database from 'better-sqlite3'
import { httpErrors, Reason, throwHttpError } from '../../utils/http-errors.js'
import { asyncHandler } from '../../utils/async-handler.js'
import { createCanvas, listCanvases, getCanvas, saveDoc } from '../../canvas.service.js'
import { countCapturesSince } from '../../capture.service.js'
import { draftFromSources, GenerateSegmentsFn } from '../../draft.service.js'

const CreateSchema = object({ title: string().trim().required(), description: string().trim() })

export const canvasController = (db: Database.Database, generateSegments: GenerateSegmentsFn): Router => {
  const router = Router()

  router.post(
    '/',
    asyncHandler(async (req, res) => {
      let body
      try {
        body = await CreateSchema.validate(req.body, { abortEarly: true, stripUnknown: true })
      } catch {
        throwHttpError(httpErrors.badRequest, Reason.MissingOrInvalidFields, res)
        return
      }
      res.status(201).json({ id: createCanvas(db, body.title, body.description ?? '') })
    })
  )

  router.get('/', (_req, res) => res.json(listCanvases(db)))

  router.get('/:id', (req, res) => {
    const canvas = getCanvas(db, Number(req.params.id))
    if (!canvas) {
      throwHttpError(httpErrors.notFound, Reason.NotFound, res)
      return
    }
    res.json({ ...canvas, newSourceCount: countCapturesSince(db, canvas.collatedAt) })
  })

  // Autosave the whole editor document.
  router.patch('/:id', (req, res) => {
    if (!getCanvas(db, Number(req.params.id))) {
      throwHttpError(httpErrors.notFound, Reason.NotFound, res)
      return
    }
    saveDoc(db, Number(req.params.id), req.body.doc)
    res.status(200).json({ ok: true })
  })

  // Generate grounded sections for the editor to insert (does not modify the doc).
  router.post(
    '/:id/draft',
    asyncHandler(async (req, res) => {
      if (!getCanvas(db, Number(req.params.id))) {
        throwHttpError(httpErrors.notFound, Reason.NotFound, res)
        return
      }
      const sections = await draftFromSources(db, Number(req.params.id), generateSegments)
      res.json({ sections })
    })
  )

  return router
}
```

- [ ] **Step 4: Update `app/src/routes.ts` and `app/src/server.ts`** — change the `GenerateSegmentsFn` import from `./collate.service.js` to `./draft.service.js` (both files import the type). No other changes.

- [ ] **Step 5: Run the whole suite, confirm pass; typecheck; commit**

```bash
cd app && npm test && npx tsc --noEmit
git -C /Users/I576470/Documents/mynotes add app/src/routes app/src/routes.ts app/src/server.ts app/test/canvas.server.test.ts
git -C /Users/I576470/Documents/mynotes commit -m "feat: canvas save-doc (PATCH) + draft endpoints"
```

---

## Task 4: TipTap deps + custom marks (aiOrigin, citation)

**Files:** `app/package.json`; Create `app/renderer/editor-marks.ts`

- [ ] **Step 1: Add deps** to `app/package.json` dependencies: `"@tiptap/react": "^2.6.0"`, `"@tiptap/starter-kit": "^2.6.0"`, `"@tiptap/core": "^2.6.0"`, `"@tiptap/pm": "^2.6.0"`. Then `cd app && npm install` (Node 24). If a version is missing, report the npm error.

- [ ] **Step 2: Create `app/renderer/editor-marks.ts`** — two custom TipTap marks. `AiOrigin` tints AI-inserted text; `Citation` carries a capture id and renders a clickable superscript.

```typescript
import { Mark, mergeAttributes } from '@tiptap/core'

// Visual attribution for AI-contributed text (not a lock — fully editable).
export const AiOrigin = Mark.create({
  name: 'aiOrigin',
  parseHTML() {
    return [{ tag: 'span[data-ai]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { 'data-ai': 'true', class: 'ai-origin' }), 0]
  }
})

// Inline citation to a capture id; rendered as a clickable superscript.
export const Citation = Mark.create({
  name: 'citation',
  addAttributes() {
    return { captureId: { default: null } }
  },
  parseHTML() {
    return [{ tag: 'sup[data-capture-id]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return [
      'sup',
      mergeAttributes(HTMLAttributes, { class: 'citation', 'data-capture-id': HTMLAttributes.captureId }),
      0
    ]
  }
})
```

- [ ] **Step 3: Typecheck; commit**

```bash
cd app && npx tsc --noEmit
git -C /Users/I576470/Documents/mynotes add app/package.json app/package-lock.json app/renderer/editor-marks.ts
git -C /Users/I576470/Documents/mynotes commit -m "feat: tiptap deps + aiOrigin/citation marks"
```

---

## Task 5: The note editor component (autosave + AI insert)

**Files:** Create `app/renderer/note-editor.tsx`

This is the core UI. It renders the TipTap editor from the canvas doc, autosaves on change (debounced), and inserts AI draft sections at the end.

- [ ] **Step 1: Create `app/renderer/note-editor.tsx`**

```typescript
import React, { useEffect, useRef } from 'react'
import { Box } from '@mui/material'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { AiOrigin, Citation } from './editor-marks.js'

interface Capture {
  id: number
  source: { url?: string; anchor?: string }
}
interface Section {
  heading: string
  text: string
  citations: number[]
}

// Imperative handle: parent triggers insertSections + reads nothing else.
export interface NoteEditorHandle {
  insertSections: (sections: Section[]) => void
}

const openCitation = (captures: Map<number, Capture>, id: number): void => {
  const c = captures.get(id)
  if (c?.source.url) window.open(`${c.source.url}${c.source.anchor || ''}`, '_blank')
}

export const NoteEditor = React.forwardRef<
  NoteEditorHandle,
  { doc: unknown; captures: Map<number, Capture>; onChange: (doc: unknown) => void }
>(({ doc, captures, onChange }, ref) => {
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const editor = useEditor({
    extensions: [StarterKit, AiOrigin, Citation],
    content: (doc as object) || { type: 'doc', content: [] },
    onUpdate: ({ editor }) => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => onChange(editor.getJSON()), 800) // debounced autosave
    }
  })

  // Click handling for citation superscripts (event delegation on the editor DOM).
  useEffect(() => {
    if (!editor) return
    const el = editor.view.dom
    const onClick = (e: MouseEvent): void => {
      const target = (e.target as HTMLElement).closest('sup.citation') as HTMLElement | null
      if (target) openCitation(captures, Number(target.getAttribute('data-capture-id')))
    }
    el.addEventListener('click', onClick)
    return () => el.removeEventListener('click', onClick)
  }, [editor, captures])

  React.useImperativeHandle(ref, () => ({
    insertSections: (sections: Section[]) => {
      if (!editor) return
      const chain = editor.chain().focus('end')
      for (const s of sections) {
        chain
          .insertContent({ type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: s.heading }] })
          .insertContent({
            type: 'paragraph',
            content: [
              { type: 'text', marks: [{ type: 'aiOrigin' }], text: s.text + ' ' },
              ...s.citations.map((id) => ({
                type: 'text',
                marks: [{ type: 'citation', attrs: { captureId: id } }],
                text: `[${id}]`
              }))
            ]
          })
      }
      chain.run()
    }
  }))

  return (
    <Box
      sx={{
        '& .ProseMirror': { outline: 'none', minHeight: 300, lineHeight: 1.7 },
        '& .ai-origin': { bgcolor: 'rgba(120,140,255,.10)' },
        '& sup.citation': { color: 'primary.light', cursor: 'pointer', ml: '2px' }
      }}
    >
      <EditorContent editor={editor} />
    </Box>
  )
})
NoteEditor.displayName = 'NoteEditor'
```

- [ ] **Step 2: Typecheck; commit**

```bash
cd app && npx tsc --noEmit
git -C /Users/I576470/Documents/mynotes add app/renderer/note-editor.tsx
git -C /Users/I576470/Documents/mynotes commit -m "feat: tiptap note editor (autosave + insert AI sections + citation clicks)"
```

---

## Task 6: Rewrite CanvasView around the note editor

**Files:** `app/renderer/canvas-view.tsx`

- [ ] **Step 1: Rewrite `app/renderer/canvas-view.tsx`** — header (title + new-sources nudge + a "Draft from sources" button), the `NoteEditor`, save via `PATCH`, draft via `POST /draft` → `insertSections`.

```typescript
import React, { useRef } from 'react'
import { Box, Typography, Button, Chip, Stack, CircularProgress } from '@mui/material'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from './main.js'
import { NoteEditor, NoteEditorHandle } from './note-editor.js'

interface Capture {
  id: number
  source: { url?: string; anchor?: string }
}
interface Canvas {
  id: number
  title: string
  doc: unknown
  newSourceCount?: number
}
interface Section {
  heading: string
  text: string
  citations: number[]
}

export const CanvasView = ({ canvasId }: { canvasId: number }): React.ReactElement => {
  const qc = useQueryClient()
  const editorRef = useRef<NoteEditorHandle>(null)
  const [error, setError] = React.useState('')

  const canvas = useQuery({
    queryKey: ['canvas', canvasId],
    queryFn: () => api.request<Canvas>(`/canvas/${canvasId}`),
    refetchInterval: 5000
  })
  const captures = useQuery({
    queryKey: ['captures'],
    queryFn: () => api.request<Capture[]>('/capture')
  })

  const save = useMutation({
    mutationFn: (doc: unknown) => api.request(`/canvas/${canvasId}`, { method: 'PATCH', body: JSON.stringify({ doc }) })
  })

  const draft = useMutation({
    mutationFn: () => api.request<{ sections: Section[] }>(`/canvas/${canvasId}/draft`, { method: 'POST' }),
    onMutate: () => setError(''),
    onSuccess: (res) => {
      editorRef.current?.insertSections(res.sections)
      qc.invalidateQueries({ queryKey: ['canvas', canvasId] }) // refresh the nudge
    },
    onError: () => setError('Draft failed — is a model available? (Check the proxy / OPENAI_API_KEY.)')
  })

  if (!canvas.data) return <CircularProgress sx={{ m: 4 }} />
  const captureMap = new Map((captures.data || []).map((c) => [c.id, c]))
  const newCount = canvas.data.newSourceCount ?? 0

  return (
    <Box sx={{ flex: 1, p: 3, overflow: 'auto' }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Typography variant="h5">{canvas.data.title}</Typography>
        <Stack direction="row" spacing={1} alignItems="center">
          {newCount > 0 && <Chip size="small" color="warning" label={`${newCount} new source${newCount === 1 ? '' : 's'}`} />}
          <Button variant="outlined" onClick={() => draft.mutate()} disabled={draft.isPending}>
            {draft.isPending ? 'Drafting…' : 'Draft from sources'}
          </Button>
        </Stack>
      </Stack>

      {error && <Typography color="error" variant="body2" sx={{ mb: 2 }}>{error}</Typography>}

      <NoteEditor
        key={canvasId}
        ref={editorRef}
        doc={canvas.data.doc}
        captures={captureMap}
        onChange={(doc) => save.mutate(doc)}
      />
    </Box>
  )
}
```

Notes:
- `key={canvasId}` remounts the editor when switching canvases (so it loads the right doc).
- The `canvas` query polls for the nudge; the editor holds its own state, so polling doesn't clobber typing (we don't reset editor content from the poll — the editor is uncontrolled after mount).

- [ ] **Step 2: Typecheck; commit**

```bash
cd app && npx tsc --noEmit
git -C /Users/I576470/Documents/mynotes add app/renderer/canvas-view.tsx
git -C /Users/I576470/Documents/mynotes commit -m "feat: canvas view uses the note editor (autosave + draft-to-insert)"
```

---

## Task 7: Build + manual verification

- [ ] **Step 1:** `cd app && npm run build:app` → exit 0 (renderer bundles).
- [ ] **Step 2:** `npm run dev` (auto-rebuilds for Electron). Open a canvas:
  - Type freely — it's a normal note; reload the canvas (switch away and back) and your text persisted (autosave + PATCH).
  - Click **Draft from sources** (needs the proxy/key) → grounded sections insert at the end, AI text tinted, `[id]` citations clickable (open the source).
  - Edit the AI-inserted text freely — no lock, no clobber. Delete what you don't want.
  - Capture a new source → within ~5s the header shows "N new sources"; Draft again to pull it in.
- [ ] **Step 3:** `npm run rebuild:node && npm test && npx tsc --noEmit` → green; commit any fixes.

---

## Self-review notes

- **Model:** the doc is the user's; AI only inserts (attribution + citations), so there is no merge and nothing to lock — matches "edit like a note, AI contributes."
- **Reused:** retrieval + grounded generation + citation validation + collatedAt nudge.
- **Risk (TipTap):** custom marks + `insertContent` with marks and citation click-delegation are the fiddly bits; if `insertContent` mark syntax differs in the installed TipTap version, adapt to its API (a `ponytail:` note is fine). Autosave is debounced; the polling `canvas` query must NOT feed back into editor content (editor is uncontrolled post-mount) or it would fight typing — the `key` remount is the only reload path.
- **Migration:** existing canvases stored `Segment[]` in `doc`; on load, TipTap gets a non-doc JSON and will error. Since this is dev, wipe canvases (or the DB) once: old canvases predate this model. (A converter isn't worth it for throwaway dev canvases.)
- **Deferred:** "insert at cursor" (currently appends at end) and stripping the aiOrigin tint when the user edits over it — both easy follow-ups.
