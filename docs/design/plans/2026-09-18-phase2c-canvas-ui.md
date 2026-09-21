# Phase 2c — Canvas UI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make canvases visible and editable in the desktop window: a left rail of canvases, a living-document view whose segments show their origin (AI vs pinned) + citations, a **Refresh** button that collates, and inline editing that locks a segment as yours.

**Architecture:** Renderer-only (React + MUI + TanStack Query + zustand) on top of the Phase-2b canvas API (`/canvas`, `/canvas/:id`, `PATCH /canvas/:id/segments/:segmentId`, `POST /canvas/:id/collate`). The app becomes two-pane: a left rail (Search + canvas list) and a main area that shows either the existing search/ask/captures view or the selected canvas. v1 renders the segment list (segment-level provenance); true word-level TipTap editing is a later refinement.

**Tech Stack:** (existing) React, MUI (`sx` only), TanStack Query over the `api` ApiClient, zustand. Desktop dialect: single quotes, **no semicolons**, no trailing commas, 2-space, arrow-const, named exports, no `any`, no `import type`. No unit tests (UI wiring — verified by tsc, build, and a manual run).

---

## Prerequisite / context

Phase 2b (canvas engine) is merged. The renderer already has `api` (ApiClient, `main.tsx`), `useUi` store (`store.ts`), and `App` (`app.tsx`). The engine runs in the Electron main process; collate (`POST /canvas/:id/collate`) requires a working LLM (Ollama running, or `CANVAS_AI_PROVIDER=anthropic` + `ANTHROPIC_API_KEY` set when the app launches) — without one, Refresh will error (surface it, don't crash).

Files added/changed under `app/renderer/`:
```
store.ts        # + view + selectedCanvasId
canvas-list.tsx # left rail: canvases + create
canvas-view.tsx # header + Refresh + segment blocks + inline edit/lock
app.tsx         # two-pane layout wiring rail + main
```

---

## Task 1: Store — view + selected canvas

**Files:** Modify `app/renderer/store.ts`

- [ ] **Step 1: Replace `app/renderer/store.ts` with**

```typescript
import { create } from 'zustand'

interface UiState {
  query: string
  mode: 'hybrid' | 'keyword' | 'semantic'
  view: 'search' | 'canvas'
  selectedCanvasId: number | null
  setQuery: (query: string) => void
  setMode: (mode: UiState['mode']) => void
  openSearch: () => void
  openCanvas: (id: number) => void
}

export const useUi = create<UiState>((set) => ({
  query: '',
  mode: 'hybrid',
  view: 'search',
  selectedCanvasId: null,
  setQuery: (query) => set({ query }),
  setMode: (mode) => set({ mode }),
  openSearch: () => set({ view: 'search', selectedCanvasId: null }),
  openCanvas: (id) => set({ view: 'canvas', selectedCanvasId: id })
}))
```

- [ ] **Step 2: Typecheck** — `cd app && npx tsc --noEmit` → exit 0 (existing `app.tsx` still compiles; it only reads `query`/`mode`/`setQuery` which remain).

- [ ] **Step 3: Commit**

```bash
git add app/renderer/store.ts
git commit -m "feat: ui store — view + selected canvas"
```

---

## Task 2: Canvas list (left rail)

**Files:** Create `app/renderer/canvas-list.tsx`

- [ ] **Step 1: Create `app/renderer/canvas-list.tsx`**

```typescript
import React, { useState } from 'react'
import { Box, List, ListItemButton, ListItemText, Typography, TextField, IconButton, Stack } from '@mui/material'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faPlus, faMagnifyingGlass } from '@fortawesome/free-solid-svg-icons'
import { useUi } from './store.js'
import { api } from './main.js'

interface CanvasSummary {
  id: number
  title: string
}

export const CanvasList = (): React.ReactElement => {
  const { view, selectedCanvasId, openSearch, openCanvas } = useUi()
  const qc = useQueryClient()
  const [title, setTitle] = useState('')

  const canvases = useQuery({
    queryKey: ['canvases'],
    queryFn: () => api.request<CanvasSummary[]>('/canvas')
  })

  const create = useMutation({
    mutationFn: (t: string) => api.request<{ id: number }>('/canvas', { method: 'POST', body: JSON.stringify({ title: t }) }),
    onSuccess: (res) => {
      setTitle('')
      qc.invalidateQueries({ queryKey: ['canvases'] })
      openCanvas(res.id)
    }
  })

  return (
    <Box sx={{ width: 240, borderRight: 1, borderColor: 'divider', p: 1.5, height: '100vh', overflow: 'auto' }}>
      <ListItemButton selected={view === 'search'} onClick={openSearch} sx={{ borderRadius: 1, mb: 1 }}>
        <FontAwesomeIcon icon={faMagnifyingGlass} />
        <ListItemText primary="Search" sx={{ ml: 1 }} />
      </ListItemButton>

      <Typography variant="overline" sx={{ opacity: 0.6 }}>Canvases</Typography>
      <List dense>
        {(canvases.data || []).map((c) => (
          <ListItemButton
            key={c.id}
            selected={view === 'canvas' && selectedCanvasId === c.id}
            onClick={() => openCanvas(c.id)}
            sx={{ borderRadius: 1 }}
          >
            <ListItemText primary={c.title} />
          </ListItemButton>
        ))}
      </List>

      <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
        <TextField
          size="small"
          fullWidth
          placeholder="New canvas…"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && title.trim()) create.mutate(title.trim())
          }}
        />
        <IconButton disabled={!title.trim()} onClick={() => create.mutate(title.trim())}>
          <FontAwesomeIcon icon={faPlus} />
        </IconButton>
      </Stack>
    </Box>
  )
}
```

- [ ] **Step 2: Add the FontAwesome deps** (used above). In `app/`:

Add to `dependencies`: `"@fortawesome/fontawesome-svg-core": "^6.6.0"`, `"@fortawesome/free-solid-svg-icons": "^6.6.0"`, `"@fortawesome/react-fontawesome": "^0.2.2"`. Then `npm install` (Node 24).

- [ ] **Step 3: Typecheck** — `cd app && npx tsc --noEmit` → exit 0.

- [ ] **Step 4: Commit**

```bash
git add app/renderer/canvas-list.tsx app/package.json app/package-lock.json
git commit -m "feat: canvas list rail (list + create)"
```

---

## Task 3: Canvas view (segments + Refresh + inline edit/lock)

**Files:** Create `app/renderer/canvas-view.tsx`

- [ ] **Step 1: Create `app/renderer/canvas-view.tsx`**

```typescript
import React, { useState } from 'react'
import { Box, Typography, Button, Card, CardContent, Chip, Stack, TextField, CircularProgress } from '@mui/material'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from './main.js'

interface Segment {
  id: string
  heading: string
  text: string
  origin: 'ai' | 'user'
  citations: number[]
}
interface Canvas {
  id: number
  title: string
  doc: Segment[]
}

const SegmentBlock = ({ canvasId, segment }: { canvasId: number; segment: Segment }): React.ReactElement => {
  const qc = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(segment.text)
  const mine = segment.origin === 'user'

  const save = useMutation({
    mutationFn: (t: string) =>
      api.request<Canvas>(`/canvas/${canvasId}/segments/${segment.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ text: t })
      }),
    onSuccess: () => {
      setEditing(false)
      qc.invalidateQueries({ queryKey: ['canvas', canvasId] })
    }
  })

  return (
    <Card sx={{ mb: 1, borderLeft: 3, borderColor: mine ? 'primary.main' : 'transparent', bgcolor: mine ? 'rgba(120,140,255,.06)' : undefined }}>
      <CardContent>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Typography variant="subtitle2">{segment.heading}</Typography>
          <Chip size="small" label={mine ? 'You · pinned' : `AI · ${segment.citations.length} sources`} />
        </Stack>
        {editing ? (
          <Box sx={{ mt: 1 }}>
            <TextField fullWidth multiline value={text} onChange={(e) => setText(e.target.value)} />
            <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
              <Button size="small" variant="contained" onClick={() => save.mutate(text)}>Save (locks it)</Button>
              <Button size="small" onClick={() => { setText(segment.text); setEditing(false) }}>Cancel</Button>
            </Stack>
          </Box>
        ) : (
          <Typography sx={{ mt: 0.5, whiteSpace: 'pre-wrap', cursor: 'text' }} onClick={() => setEditing(true)}>
            {segment.text}
          </Typography>
        )}
        {segment.citations.length > 0 && (
          <Stack direction="row" spacing={0.5} sx={{ mt: 1, flexWrap: 'wrap' }}>
            {segment.citations.map((id) => (
              <Chip key={id} size="small" variant="outlined" label={`#${id}`} />
            ))}
          </Stack>
        )}
      </CardContent>
    </Card>
  )
}

export const CanvasView = ({ canvasId }: { canvasId: number }): React.ReactElement => {
  const qc = useQueryClient()
  const [error, setError] = useState('')

  const canvas = useQuery({
    queryKey: ['canvas', canvasId],
    queryFn: () => api.request<Canvas>(`/canvas/${canvasId}`)
  })

  const refresh = useMutation({
    mutationFn: () => api.request<{ doc: Segment[] }>(`/canvas/${canvasId}/collate`, { method: 'POST' }),
    onMutate: () => setError(''),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['canvas', canvasId] }),
    onError: () => setError('Collate failed — is a model available? (Ollama running, or a Claude key set.)')
  })

  if (!canvas.data) return <CircularProgress sx={{ m: 4 }} />
  const doc = canvas.data.doc

  return (
    <Box sx={{ flex: 1, p: 3, overflow: 'auto' }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Typography variant="h5">{canvas.data.title}</Typography>
        <Button variant="outlined" onClick={() => refresh.mutate()} disabled={refresh.isPending}>
          {refresh.isPending ? 'Collating…' : '↻ Refresh'}
        </Button>
      </Stack>

      {error && <Typography color="error" variant="body2" sx={{ mb: 2 }}>{error}</Typography>}

      {doc.length === 0 && (
        <Typography variant="body2" sx={{ opacity: 0.6 }}>
          Empty. Click Refresh to collate a draft from your saved sources.
        </Typography>
      )}

      {doc.map((segment) => (
        <SegmentBlock key={segment.id} canvasId={canvasId} segment={segment} />
      ))}
    </Box>
  )
}
```

- [ ] **Step 2: Typecheck** — `cd app && npx tsc --noEmit` → exit 0.

- [ ] **Step 3: Commit**

```bash
git add app/renderer/canvas-view.tsx
git commit -m "feat: canvas view — segments, refresh, inline edit/lock"
```

---

## Task 4: Two-pane layout in App

**Files:** Modify `app/renderer/app.tsx`

- [ ] **Step 1: Wrap the existing search UI and add the rail.** Change `app.tsx` so the top-level render is a flex row: `<CanvasList />` on the left, and on the right either `<CanvasView canvasId={selectedCanvasId} />` (when `view === 'canvas'` and an id is set) or the existing search/ask/captures block.

Concretely: rename the current `App` body into a `SearchView` component (move the search bar + ask + captures list into it, unchanged), then:

```typescript
import { useUi } from './store.js'
import { CanvasList } from './canvas-list.js'
import { CanvasView } from './canvas-view.js'
import { Box } from '@mui/material'

export const App = (): React.ReactElement => {
  const { view, selectedCanvasId } = useUi()
  return (
    <Box sx={{ display: 'flex', height: '100vh' }}>
      <CanvasList />
      {view === 'canvas' && selectedCanvasId !== null ? (
        <CanvasView canvasId={selectedCanvasId} />
      ) : (
        <SearchView />
      )}
    </Box>
  )
}
```

Keep `SearchView` as the previous search/ask/captures markup (it already uses `useUi` for `query`/`mode` and `api`). Remove the outer `maxWidth: 900, mx: 'auto'` centering from the search block or keep it inside `SearchView`'s own `Box` — either is fine; the point is the rail sits beside it.

- [ ] **Step 2: Typecheck** — `cd app && npx tsc --noEmit` → exit 0. Run the existing suite too: `npm test` (unaffected; should stay green).

- [ ] **Step 3: Commit**

```bash
git add app/renderer/app.tsx
git commit -m "feat: two-pane layout (canvas rail + main)"
```

---

## Task 5: Build + manual verification

- [ ] **Step 1: Headless build** — `cd app && npm run build:app` → exit 0 (catches renderer bundling errors without a display).

- [ ] **Step 2: Launch** — `npm run dev` (auto-rebuilds for Electron). The window shows the left rail with **Search** + a **New canvas…** box.

- [ ] **Step 3: Verify canvas flow**
  - Create a canvas titled to match your captures (e.g. `Pod` or `Wikipedia`).
  - It opens empty. Click **Refresh**:
    - If a model is available (Ollama running with the configured model, or launch the app with `CANVAS_AI_PROVIDER=anthropic ANTHROPIC_API_KEY=... CANVAS_AI_MODEL=claude-... npm run dev`), AI segments appear with `#id` citation chips.
    - If no model, you'll see the friendly "Collate failed — is a model available?" message (not a crash).
  - Click a segment's text → edit it → **Save (locks it)** → its badge flips to **"You · pinned"** with the accent border.
  - Click **Refresh** again → your pinned segment stays verbatim; AI segments regenerate.

- [ ] **Step 4: Commit any fixes**

```bash
cd app && npx tsc --noEmit && npm test
git add -A && git commit -m "test: phase 2c canvas ui green" # if needed
```

---

## Self-review notes / next

- **Spec coverage (2c):** canvas list + create (Task 2), living-document view with per-segment origin badges + citation chips (Task 3), Refresh → collate (Task 3), inline edit that locks a segment (Task 3), two-pane search+canvas shell (Task 4). ✅
- **v1 simplifications (per spec):** segment-block editing, not word-level inline provenance (TipTap). Citation chips show `#id`; resolving them to source titles/links (and a click-to-open) is a small follow-up. No "N new sources" nudge yet (manual Refresh only).
- **Needs a model:** Refresh/collate requires Ollama or a Claude key at launch; the UI degrades gracefully without one.
- **Deferred (Phase 3):** packaging + notarization (fixes the dev-Electron Gatekeeper friction), screen-region OCR capture, TipTap word-level provenance, citation-chip enrichment, the new-sources nudge.
```
