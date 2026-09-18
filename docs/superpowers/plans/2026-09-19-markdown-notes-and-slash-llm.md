# Markdown Notes + /llm Command + Draft-on-Create — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use `- [ ]` checkboxes.

**Goal:** (1) Offer "draft from sources" at note-creation only; (2) remove the in-note re-draft button; (3) add an inline `/llm <prompt>` command that runs the prompt with the whole document as context (grounded in sources) and inserts the result in place; (4) render AI output as markdown, with citations as clickable source links.

**Architecture:** AI generation now returns **markdown** (not segment objects). The engine has one grounded markdown generator used by two endpoints: `POST /canvas/:id/draft` (a topic brief, once at creation) and `POST /canvas/:id/complete` (follow a user prompt with the current doc as context). The TipTap editor renders markdown (StarterKit input rules for typing; `marked` to insert AI markdown as formatted HTML) and links open externally. The custom `aiOrigin`/`citation` marks are dropped — citations are markdown links `[label](url)`.

**Tech Stack:** existing engine + AI SDK; UI adds `marked` and `@tiptap/extension-link`. Desktop dialect (no semicolons), MUI `sx`, TanStack Query, Node 24 (`npm test` auto-rebuilds better-sqlite3).

---

## Task 1: Markdown generator (replaces segment generator)

**Files:** rename `app/src/collate-generator.ts` → `app/src/markdown-generator.ts`; `app/test/collate-generator.test.ts` → `app/test/markdown-generator.test.ts`

- [ ] **Step 1: Write `app/test/markdown-generator.test.ts`**

```typescript
import { describe, it, expect } from 'vitest'
import { makeMarkdownGenerator } from '../src/markdown-generator.js'

describe('makeMarkdownGenerator', () => {
  it('returns a callable for openai', () => {
    const gen = makeMarkdownGenerator({ provider: 'openai', model: 'gpt-5-mini', openaiApiKey: 'k', openaiBaseURL: 'http://x' })
    expect(typeof gen).toBe('function')
  })

  it('passes instruction + sources (with urls) to the model and returns its text', async () => {
    let seen = ''
    const fake = async (prompt: string) => {
      seen = prompt
      return '## Overview\nPods share a flat network. [k8s](https://k8s.io)'
    }
    const gen = makeMarkdownGenerator({ provider: 'openai', model: 'x', openaiApiKey: 'k', openaiBaseURL: 'http://x' }, fake)
    const md = await gen('brief on Kubernetes', [{ id: 1, content: 'flat pod network', url: 'https://k8s.io' }], '')
    expect(seen).toContain('flat pod network')
    expect(seen).toContain('https://k8s.io')
    expect(md).toContain('## Overview')
  })
})
```

- [ ] **Step 2: Run, confirm fail:** `cd app && npm test -- test/markdown-generator.test.ts`

- [ ] **Step 3: Create `app/src/markdown-generator.ts`**

```typescript
import { generateText } from 'ai'
import { AiConfig, createModel } from './model.js'

export interface Source {
  id: number
  content: string
  url?: string
}

// Follows an instruction, grounded ONLY in the given sources, using the current
// document as optional context. Returns markdown; cites sources as links.
export type GenerateMarkdownFn = (instruction: string, sources: Source[], docContext: string) => Promise<string>

type TextFn = (prompt: string) => Promise<string>

const buildPrompt = (instruction: string, sources: Source[], docContext: string): string => {
  const src = sources
    .map((s) => `[${s.id}] ${s.content}${s.url ? ` (source: ${s.url})` : ''}`)
    .join('\n')
  const ctx = docContext.trim() ? `\n\nCURRENT DOCUMENT (context — do not repeat verbatim):\n${docContext}` : ''
  return `${instruction}

Write GitHub-flavored Markdown. Be concise and non-repetitive. Use ONLY the numbered sources for facts; when you use one, cite it inline as a markdown link to its source url, e.g. [ref](https://…). Do not invent sources.${ctx}

SOURCES:
${src}`
}

export const makeMarkdownGenerator = (ai: AiConfig, textFn?: TextFn): GenerateMarkdownFn => {
  const generate: TextFn =
    textFn ?? (async (prompt: string) => (await generateText({ model: createModel(ai), prompt })).text)
  return (instruction, sources, docContext) => generate(buildPrompt(instruction, sources, docContext))
}
```

- [ ] **Step 4: Delete the old generator/test**

```bash
git -C /Users/I576470/Documents/mynotes rm app/src/collate-generator.ts app/test/collate-generator.test.ts
```

- [ ] **Step 5: Run, confirm pass; commit**

```bash
cd app && npm test -- test/markdown-generator.test.ts
git -C /Users/I576470/Documents/mynotes add app/src/markdown-generator.ts app/test/markdown-generator.test.ts
git -C /Users/I576470/Documents/mynotes commit -m "feat: grounded markdown generator (replaces segment generator)"
```

---

## Task 2: Draft + complete services (return markdown)

**Files:** `app/src/draft.service.ts`, `app/test/draft.service.test.ts`

- [ ] **Step 1: Rewrite `app/test/draft.service.test.ts`**

```typescript
import { describe, it, expect } from 'vitest'
import { openDb } from '../src/db.js'
import { insertCapture } from '../src/capture.service.js'
import { createCanvas, getCanvas } from '../src/canvas.service.js'
import { draftFromSources, completeInline } from '../src/draft.service.js'
import { Source } from '../src/markdown-generator.js'

describe('draft.service', () => {
  it('draftFromSources returns markdown from sources and stamps collatedAt', async () => {
    const db = openDb(':memory:')
    await insertCapture(db, { content: 'Kubernetes uses a flat pod network', source: { type: 'web', url: 'https://k8s.io' } })
    const id = createCanvas(db, 'Kubernetes')
    const gen = async (instruction: string, sources: Source[]) => `# ${instruction}\n${sources.length} sources`
    const md = await draftFromSources(db, id, gen)
    expect(md).toContain('#')
    expect(getCanvas(db, id)!.collatedAt).not.toBe('')
    db.close()
  })

  it('completeInline passes the prompt + doc context to the generator', async () => {
    const db = openDb(':memory:')
    await insertCapture(db, { content: 'pods share a network', source: { type: 'web' } })
    const id = createCanvas(db, 'K')
    let seenInstruction = ''
    let seenCtx = ''
    const gen = async (instruction: string, _s: Source[], ctx: string) => {
      seenInstruction = instruction
      seenCtx = ctx
      return 'result md'
    }
    const md = await completeInline(db, id, 'summarise open questions', 'my current notes', gen)
    expect(seenInstruction).toContain('summarise open questions')
    expect(seenCtx).toBe('my current notes')
    expect(md).toBe('result md')
    db.close()
  })
})
```

- [ ] **Step 2: Run, confirm fail:** `cd app && npm test -- test/draft.service.test.ts`

- [ ] **Step 3: Rewrite `app/src/draft.service.ts`**

```typescript
import Database from 'better-sqlite3'
import { getCanvas, markCollated } from './canvas.service.js'
import { hybridSearch } from './search.service.js'
import { GenerateMarkdownFn, Source } from './markdown-generator.js'

const RETRIEVE_K = 12

const sourcesFor = async (db: Database.Database, query: string): Promise<Source[]> => {
  const hits = await hybridSearch(db, query, RETRIEVE_K)
  return hits.map((h) => ({ id: h.capture.id, content: h.capture.content, url: h.capture.source.url }))
}

// One-time draft from the canvas topic (used at creation).
export const draftFromSources = async (
  db: Database.Database,
  canvasId: number,
  generate: GenerateMarkdownFn
): Promise<string> => {
  const canvas = getCanvas(db, canvasId)
  if (!canvas) return ''
  const topic = [canvas.title, canvas.description].filter(Boolean).join(' — ')
  const md = await generate(`Write a concise brief on "${topic}".`, await sourcesFor(db, topic), '')
  markCollated(db, canvasId)
  return md
}

// Inline /llm command: follow the user's prompt with the current doc as context.
export const completeInline = async (
  db: Database.Database,
  canvasId: number,
  prompt: string,
  docContext: string,
  generate: GenerateMarkdownFn
): Promise<string> => {
  const canvas = getCanvas(db, canvasId)
  if (!canvas) return ''
  const query = [prompt, canvas.title].filter(Boolean).join(' ')
  return generate(prompt, await sourcesFor(db, query), docContext)
}
```

- [ ] **Step 4: Run, confirm pass; commit**

```bash
cd app && npm test -- test/draft.service.test.ts
git -C /Users/I576470/Documents/mynotes add app/src/draft.service.ts app/test/draft.service.test.ts
git -C /Users/I576470/Documents/mynotes commit -m "feat: draft + inline-complete services return markdown"
```

---

## Task 3: Routes + server (draft/complete return markdown; markdown generator injected)

**Files:** `app/src/routes/canvas/canvas.controller.ts`, `app/src/routes.ts`, `app/src/server.ts`, `app/src/index.ts`, `app/electron/main.ts`, `app/test/canvas.server.test.ts`

- [ ] **Step 1: Update `app/test/canvas.server.test.ts`** — the stub generator now returns markdown; assert `/draft` and `/complete`.

```typescript
import { describe, it, expect } from 'vitest'
import { openDb } from '../src/db.js'
import { buildServer } from '../src/server.js'

const TOKEN = 'test-token'
const makeServer = () => {
  const db = openDb(':memory:')
  const app = buildServer(db, async () => 'stub', TOKEN, async () => '## Draft\ntext [r](https://e.com)')
  return app.listen(0)
}

describe('canvas routes', () => {
  it('creates, saves doc, drafts (markdown), completes (markdown)', async () => {
    const server = makeServer()
    const { port } = server.address() as { port: number }
    const base = `http://localhost:${port}`
    const headers = { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` }

    const created = await (await fetch(`${base}/canvas`, { method: 'POST', headers, body: JSON.stringify({ title: 'A' }) })).json()
    const doc = { type: 'doc', content: [] }
    expect((await fetch(`${base}/canvas/${created.id}`, { method: 'PATCH', headers, body: JSON.stringify({ doc }) })).status).toBe(200)

    const draft = await (await fetch(`${base}/canvas/${created.id}/draft`, { method: 'POST', headers })).json()
    expect(draft.markdown).toContain('## Draft')

    const done = await (await fetch(`${base}/canvas/${created.id}/complete`, { method: 'POST', headers, body: JSON.stringify({ prompt: 'x', doc: 'ctx' }) })).json()
    expect(done.markdown).toContain('## Draft')

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

- [ ] **Step 2: Run, confirm fail.**

- [ ] **Step 3: Update the canvas controller** — replace the `draft` handler and add `complete`; import from the new modules.

Replace the imports of `draftFromSources, GenerateSegmentsFn` with:
```typescript
import { draftFromSources, completeInline } from '../../draft.service.js'
import { GenerateMarkdownFn } from '../../markdown-generator.js'
```
Change the controller signature param type to `generate: GenerateMarkdownFn`, and the two handlers:
```typescript
  router.post(
    '/:id/draft',
    asyncHandler(async (req, res) => {
      if (!getCanvas(db, Number(req.params.id))) {
        throwHttpError(httpErrors.notFound, Reason.NotFound, res)
        return
      }
      const markdown = await draftFromSources(db, Number(req.params.id), generate)
      res.json({ markdown })
    })
  )

  router.post(
    '/:id/complete',
    asyncHandler(async (req, res) => {
      if (!getCanvas(db, Number(req.params.id))) {
        throwHttpError(httpErrors.notFound, Reason.NotFound, res)
        return
      }
      const { prompt = '', doc = '' } = req.body as { prompt?: string; doc?: string }
      const markdown = await completeInline(db, Number(req.params.id), prompt, doc, generate)
      res.json({ markdown })
    })
  )
```

- [ ] **Step 4: Update `routes.ts` and `server.ts`** — change the injected type from `GenerateSegmentsFn` (draft.service) to `GenerateMarkdownFn` (markdown-generator). The param name/threading stays. Update `index.ts` and `electron/main.ts` to build it: `import { makeMarkdownGenerator } from './markdown-generator.js'` (or `../src/...` in electron/main) and pass `makeMarkdownGenerator(AI)` as the 4th `buildServer` arg (replace `makeSegmentGenerator`). Grep to be sure nothing references `makeSegmentGenerator`/`GenerateSegmentsFn`: `grep -rn "SegmentGenerator\|GenerateSegmentsFn\|makeSegmentGenerator" app/src app/electron`.

- [ ] **Step 5: Whole suite + typecheck; commit**

```bash
cd app && npm test && npx tsc --noEmit
git -C /Users/I576470/Documents/mynotes add app/src app/electron app/test/canvas.server.test.ts
git -C /Users/I576470/Documents/mynotes commit -m "feat: /draft + /complete return markdown; inject markdown generator"
```

---

## Task 4: UI deps (marked + link extension)

**Files:** `app/package.json`

- [ ] **Step 1:** Add to dependencies: `"marked": "^13.0.0"`, `"@tiptap/extension-link": "^2.6.0"`. `cd app && npm install`. Typecheck (`npx tsc --noEmit`). Commit `chore: add marked + tiptap link`.

---

## Task 5: Note editor — markdown insert, /llm command, links

**Files:** rewrite `app/renderer/note-editor.tsx`; delete `app/renderer/editor-marks.ts`

- [ ] **Step 1: Rewrite `app/renderer/note-editor.tsx`**

```typescript
import React, { useEffect, useRef } from 'react'
import { Box } from '@mui/material'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import { marked } from 'marked'

export interface NoteEditorHandle {
  insertMarkdown: (md: string) => void
}

// Turn the block the cursor is in into plain text if it starts with the command.
const readSlashCommand = (line: string): string | null => {
  const m = line.match(/^\/llm\s+(.+)$/)
  return m ? m[1].trim() : null
}

export const NoteEditor = React.forwardRef<
  NoteEditorHandle,
  { doc: unknown; onChange: (doc: unknown) => void; onCommand: (prompt: string) => Promise<string> }
>(({ doc, onChange, onCommand }, ref) => {
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const editor = useEditor({
    extensions: [StarterKit, Link.configure({ openOnClick: true, autolink: true })],
    content: (doc as object) || { type: 'doc', content: [] },
    onUpdate: ({ editor }) => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => onChange(editor.getJSON()), 800)
    },
    editorProps: {
      handleKeyDown: (view, event) => {
        if (event.key !== 'Enter') return false
        const { $from } = view.state.selection
        const prompt = readSlashCommand($from.parent.textContent)
        if (!prompt) return false
        event.preventDefault()
        // Delete the command line, then insert the AI markdown at that spot.
        const start = $from.start()
        const end = $from.end()
        onCommand(prompt).then((md) => {
          if (!editor) return
          editor
            .chain()
            .focus()
            .deleteRange({ from: start, to: end })
            .insertContent(marked.parse(md, { async: false }) as string)
            .run()
        })
        return true
      }
    }
  })

  useEffect(() => {
    if (!editor) return
    // Open links in the external browser (Electron main handles will-navigate).
    const el = editor.view.dom
    const onClick = (e: MouseEvent): void => {
      const a = (e.target as HTMLElement).closest('a') as HTMLAnchorElement | null
      if (a?.href) {
        e.preventDefault()
        window.open(a.href, '_blank')
      }
    }
    el.addEventListener('click', onClick)
    return () => el.removeEventListener('click', onClick)
  }, [editor])

  React.useImperativeHandle(ref, () => ({
    insertMarkdown: (md: string) => {
      editor?.chain().focus('end').insertContent(marked.parse(md, { async: false }) as string).run()
    }
  }))

  return (
    <Box
      sx={{
        '& .ProseMirror': { outline: 'none', minHeight: 300, lineHeight: 1.7 },
        '& .ProseMirror a': { color: 'primary.light', cursor: 'pointer' }
      }}
    >
      <EditorContent editor={editor} />
    </Box>
  )
})
NoteEditor.displayName = 'NoteEditor'
```

- [ ] **Step 2: Delete `app/renderer/editor-marks.ts`** (`git rm`), typecheck, commit `feat: markdown note editor with /llm command + external links`.
  - If TipTap's `handleKeyDown`/`insertContent(html)`/`marked.parse` typings need a minor tweak to compile, adapt minimally (note it). The `/llm` handler must: detect `/llm <prompt>` in the current block on Enter, delete that block's text, call `onCommand`, and insert the returned markdown as formatted content at that position.

---

## Task 6: Note view — no re-draft, auto-draft on create, /llm wiring

**Files:** `app/renderer/canvas-view.tsx`, `app/renderer/store.ts`

- [ ] **Step 1: Add auto-draft flag to `store.ts`** — add `pendingDraftId: number | null`, `setPendingDraft: (id) => void`; `openCanvas(id)` leaves it; add a `createAndDraft` helper is not needed — the list sets it.

Add to the `UiState` interface and store:
```typescript
  pendingDraftId: number | null
  setPendingDraft: (id: number | null) => void
```
```typescript
  pendingDraftId: null,
  setPendingDraft: (id) => set({ pendingDraftId: id }),
```

- [ ] **Step 2: Rewrite `app/renderer/canvas-view.tsx`**

```typescript
import React, { useEffect, useRef } from 'react'
import { Box, Typography, Chip, Stack, CircularProgress } from '@mui/material'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from './main.js'
import { useUi } from './store.js'
import { NoteEditor, NoteEditorHandle } from './note-editor.js'

interface Canvas {
  id: number
  title: string
  doc: unknown
  newSourceCount?: number
}

export const CanvasView = ({ canvasId }: { canvasId: number }): React.ReactElement => {
  const qc = useQueryClient()
  const editorRef = useRef<NoteEditorHandle>(null)
  const { pendingDraftId, setPendingDraft } = useUi()

  const canvas = useQuery({
    queryKey: ['canvas', canvasId],
    queryFn: () => api.request<Canvas>(`/canvas/${canvasId}`),
    refetchInterval: 5000
  })

  const save = useMutation({
    mutationFn: (doc: unknown) => api.request(`/canvas/${canvasId}`, { method: 'PATCH', body: JSON.stringify({ doc }) })
  })

  const runComplete = async (prompt: string): Promise<string> => {
    const docText = JSON.stringify(canvas.data?.doc ?? {}) // whole-doc context
    const res = await api.request<{ markdown: string }>(`/canvas/${canvasId}/complete`, {
      method: 'POST',
      body: JSON.stringify({ prompt, doc: docText })
    })
    return res.markdown
  }

  // One-time draft when the note was created with "draft from sources".
  useEffect(() => {
    if (pendingDraftId !== canvasId || !editorRef.current) return
    setPendingDraft(null)
    api
      .request<{ markdown: string }>(`/canvas/${canvasId}/draft`, { method: 'POST' })
      .then((r) => {
        editorRef.current?.insertMarkdown(r.markdown)
        qc.invalidateQueries({ queryKey: ['canvas', canvasId] })
      })
      .catch(() => undefined)
  }, [pendingDraftId, canvasId, setPendingDraft, qc])

  if (!canvas.data) return <CircularProgress sx={{ m: 4 }} />
  const newCount = canvas.data.newSourceCount ?? 0

  return (
    <Box sx={{ flex: 1, p: 3, overflow: 'auto' }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Typography variant="h5">{canvas.data.title}</Typography>
        {newCount > 0 && <Chip size="small" color="warning" label={`${newCount} new source${newCount === 1 ? '' : 's'} — use /llm to pull in`} />}
      </Stack>
      <Typography variant="caption" sx={{ opacity: 0.5, display: 'block', mb: 1 }}>
        Type <b>/llm your instruction</b> then Enter to have AI write here from your sources.
      </Typography>
      <NoteEditor key={canvasId} ref={editorRef} doc={canvas.data.doc} onChange={(d) => save.mutate(d)} onCommand={runComplete} />
    </Box>
  )
}
```

- [ ] **Step 3:** typecheck; commit `feat: note view — auto-draft on create, /llm wiring, no re-draft button`.

---

## Task 7: Note creation — "draft from sources" option

**Files:** `app/renderer/canvas-list.tsx`

- [ ] **Step 1:** Add a checkbox "Draft from sources" to the new-note form. On create success, if checked, `setPendingDraft(res.id)` before `openCanvas(res.id)` (so the note view auto-drafts once). Use MUI `Checkbox` + `FormControlLabel`. Keep the existing title + description fields. Import `setPendingDraft` from the store.

- [ ] **Step 2:** typecheck; commit `feat: draft-from-sources option at note creation`.

---

## Task 8: Build + manual verification

- [ ] **Step 1:** `cd app && npm run build:app` → exit 0.
- [ ] **Step 2:** `npm run dev`:
  - New note with **Draft from sources** checked → note opens and auto-fills a **markdown** brief with clickable source links; unchecked → opens blank.
  - No "Draft" button in the note.
  - Type markdown (`## H`, `- item`, `**bold**`) → formats live.
  - Type `/llm summarise the open questions` + Enter → the line is replaced by AI markdown written from your sources, using the whole doc as context.
  - Click a source link → opens in your browser.
  - Edit anything freely; autosave persists (switch away/back).
- [ ] **Step 3:** `npm run rebuild:node && npm test && npx tsc --noEmit` → green; commit any fixes.

---

## Notes
- **Dropped:** `aiOrigin`/`citation` marks and segment objects — superseded by markdown + source links.
- **Grounding:** both `/draft` and `/llm` retrieve relevant captures; `/llm` also passes the whole document as context.
- **Risk:** TipTap `handleKeyDown` slash detection + `insertContent(html)` are the fiddly bits; adapt to the installed API if needed (a `ponytail:` note is fine). `marked.parse` is called synchronously (`{ async: false }`).
- **Deferred:** streaming the AI output; a `/llm` affordance (menu) beyond typing the command.
