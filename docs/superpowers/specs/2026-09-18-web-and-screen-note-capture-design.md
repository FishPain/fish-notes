# Web & Screen Note Capture — Design

**Date:** 2026-09-18
**Status:** Draft for review

## Problem

While reading web pages, documents, or code, I frequently want to note a thought
tied to a *specific* sentence, line, or region — without altering the original
source. Today those notes go into a general notes app where they lose their
anchor to the source and become tedious to find later, especially for a single
line inside a long document. I want to:

1. Capture content + a note quickly, from anywhere, without touching the source.
2. Store it with its **datetime** and **source location**.
3. Browse it and find it later via **normal search** and **semantic/AI search**.
4. Jump back to roughly where it came from.

## Core Decisions (settled during brainstorming)

- **Viewing model:** view the captured passage + its note together in one
  searchable place, with a best-effort "jump to source" link. We do **not**
  re-render highlights live on the original page. (Lazier; robust to source
  changes.)
- **Capture is decoupled from the app.** The app is an **engine** exposing a
  local HTTP endpoint; any number of capturers POST the same note schema to it.
- **Two capturers ship** (browser first, then macOS):
  - **Browser extension** — the priority, since web is the main source.
  - **macOS "box" app** — native menu-bar agent for non-web sources.
- **Code/editor capture is out of scope for now** (deferred; the same schema
  has room for `filePath`/`line` when we add it).
- **AI is hybrid:** embeddings + search always run **locally**; question
  answering can use **local (Ollama)** or **cloud (user API key)** per query.
- **The engine runs in Docker.** Reproducible, nothing to install on the host.
  Trade-off accepted: the container must be running to capture/search, and it
  depends on Docker Desktop on macOS.
- **UI is a web page served by the container** (no Electron needed for MVP).
  A native Swift app / Electron shell can come later; both are just clients.

## Architecture

```
┌─────────────────┐     ┌──────────────────┐
│ Browser         │     │ macOS box app    │
│ extension       │     │ (Phase 2)        │
│ (Phase 1)       │     │                  │
└───────┬─────────┘     └────────┬─────────┘
        │  POST /capture (+token)          │
        └──────────────┬───────────────────┘
                       ▼
        ┌──────────────────────────────────────┐
        │  ENGINE  (Docker container)           │
        │  - HTTP API: /capture /search /ask    │
        │  - SQLite (volume): notes, FTS5, vec  │
        │  - local embedding model              │
        │  - optional local LLM (Ollama)        │
        │  - serves the web UI                  │
        └──────────────────────────────────────┘
                       ▲
                       │ browser opens local UI
                 ┌─────┴─────┐
                 │  Web UI    │  browse / search / ask / edit
                 └───────────┘
```

### Unified note schema

Every capturer POSTs the same JSON to `/capture`. Fields that don't apply are
left empty.

```jsonc
{
  "content":     "the text/code I selected (or OCR'd)",
  "contextText": "surrounding paragraph/section",
  "note":        "my comment",
  "source": {
    "type":        "web" | "app",
    "url":         "https://…",          // web
    "scrollAnchor":"#:~:text=…",         // web: text fragment to re-locate
    "appName":     "Preview",            // app
    "windowTitle": "report.pdf",         // app
    "filePath":    null,                 // reserved (code, later)
    "line":        null                  // reserved (code, later)
  },
  "screenshot":  "<optional base64 image>",
  "tags":        ["optional", "free-form"],
  "capturedAt":  "2026-09-18T10:32:00Z"
}
```

## Components

### 1. Engine (Docker container) — Phase 1

- **HTTP API** (single small service):
  - `POST /capture` — validate, store, embed. Requires shared token.
  - `GET  /search?q=&mode=normal|semantic|hybrid&filters…`
  - `POST /ask` — retrieve top-k notes, answer via local or cloud LLM, return
    answer + source note links.
  - `GET/PATCH/DELETE /notes/:id` — view, edit note text/tags, delete.
  - `GET  /notes/:id/related` — top-k semantically similar notes.
  - `POST/DELETE /notes/:id/links` — manage manual links (backlinks).
  - `GET  /export?format=markdown|json` — export all notes.
  - serves the static web UI.
- **Storage** (SQLite on a mounted volume so it survives restarts):
  - `notes` — schema fields (incl. `tags`) + `id`.
  - `notes_fts` (FTS5) — keyword search.
  - `vec_notes` (sqlite-vec) — one embedding per note (also powers "related notes").
  - `note_links` — manual explicit links (`from_id`, `to_id`).
- **Embeddings:** local small model (e.g. `all-MiniLM-L6-v2`). Nothing leaves
  the machine for indexing/search.
- **LLM for /ask:** local Ollama (containerized) or cloud via user-supplied key.

### 2. Browser extension — Phase 1

- Trigger: toolbar action / hotkey / context menu.
- Two selection modes:
  - **Text-select** — precise single sentence/line.
  - **Box-draw** — draw a rectangle over the page; read the real DOM text of
    elements under the box (full DOM access, no OCR).
- Captures: `content`, `contextText` (surrounding paragraph/section from the
  DOM), `url`, `scrollAnchor` (a `#:~:text=` fragment generated from the
  selection), an auto screenshot of the region (`chrome.tabs.captureVisibleTab`),
  `capturedAt`.
- **Capture UX:** on select/box, an **inline, non-blocking popup** appears near
  the selection with an **optional** note field + tag field. Keyboard-driven:
  **Enter** saves, **Esc** saves without a note (pure clip). Never blocks the
  page; a toast confirms. (Comment is always optional — clip now, annotate
  later in the app.)
- POSTs to the engine with the shared token.
- **Offline/engine-down:** queue in `chrome.storage` and retry, so a capture is
  never lost.

### 3. Web UI (served by engine) — Phase 1

- List/browse notes (newest first), filter by date / source type / domain / tag.
- Normal + semantic + hybrid search box.
- "Ask a question" panel (choose local/cloud).
- Open a note: see content, contextText, screenshot, note; edit note & tags;
  delete; **jump to source**; a **related notes** list (auto, semantic) and any
  **linked notes** (manual backlinks) with an "add link" action.
- Export all as markdown or JSON.

### 4. macOS box app (native, menu-bar) — Phase 2

- Global hotkey → transparent full-screen box overlay → draw rectangle.
- Read text via macOS **Accessibility API** hit-test where the app exposes it
  (great for native apps); otherwise **screenshot + OCR** fallback so nothing is
  un-capturable.
- Fills `appName`, `windowTitle`, `screenshot`; POSTs the same schema.
- Same offline queue/retry behavior.

## Data Flow

Capturer builds note JSON → `POST /capture` (with token) → engine validates →
insert into `notes`, update `notes_fts`, compute + store embedding in
`vec_notes` → note visible in UI immediately.

## Search & AI

- **Normal:** FTS5 + filters (date, source type, domain/app, tag).
- **Semantic:** embed query → sqlite-vec top-k → merge with keyword hits (hybrid
  by default).
- **Ask:** retrieve top-k relevant notes → send *only those* to the answerer
  (local Ollama or cloud) → return answer + links to the source notes.

## Jump to Source

- **Web:** reopen `url + scrollAnchor` (`#:~:text=`), so the browser scrolls to
  and highlights the exact passage.
- **App (Phase 2):** best-effort reopen/focus the app; otherwise the screenshot
  + contextText stand on their own.

## Organization / Editing (confirmed in brainstorming)

- **Structure:** flat, searchable list of notes. **Tags** free-form and
  optional. Auto-grouped by source domain/app in the UI. **No folders / no
  collections** (YAGNI).
- **Links between notes (primary organizing feature):**
  - **Auto "related notes"** — computed from embedding similarity (top-k) at
    view time. No storage, no filing effort; reuses the embeddings we already
    build.
  - **Manual links** — you can explicitly connect note A → note B; these show
    as first-class backlinks on both notes. Stored in a `note_links` table.
  - **Display:** a related/linked-notes **list** on each note. **No graph
    view** (deferred — more build than day-to-day value).
- **Editing (reference-only):** edit your note text + tags anytime; delete a
  note. The captured `content`/`contextText` are an **immutable snapshot** of
  the source and are read-only. No status/done/workflow fields (notes are
  reference, not tasks).
- **Backup:** single machine; the SQLite file lives in a Docker volume —
  "backup" = copy that file (optionally an auto-export on a schedule). **No
  cloud sync** now; the volume can later point at a synced folder (iCloud/
  Dropbox) for a second Mac, one engine at a time.
- **Export:** both **markdown** (readable) and **JSON** (full-fidelity backup)
  via `/export`. **Export-all** for now; filtered/subset export deferred.

## Error Handling / Sharp Edges

- **Engine down at capture:** capturer queues locally and retries. No lost
  captures.
- **Localhost trust boundary:** `/capture` requires a shared token set at
  install, so stray web pages / local processes can't inject notes. (Security —
  not skipped.)
- **Source changes/disappears:** `content` + `contextText` + `screenshot` are
  self-contained; jump-to-source is best-effort on top.
- **Chrome screenshot limits:** `captureVisibleTab` grabs only the visible tab
  area — acceptable, since the box is drawn on visible content.

## Testing

- Engine: unit tests for `/capture` validation + token check; search returns
  expected notes for keyword and semantic queries; export round-trip.
- Extension: text-fragment anchor generation produces a fragment that re-locates
  the selection; offline queue flushes on reconnect.
- One end-to-end check: capture from a page → note appears in UI → jump-to-source
  scrolls to the passage.

## Phasing (build order)

1. **Phase 1 (first implementation plan):** engine container (API + SQLite +
   FTS5 + sqlite-vec + local embeddings) + web UI + browser extension +
   hybrid search + ask (local + cloud). This is a complete, daily-usable tool.
2. **Phase 2:** native macOS box app (AX + screenshot/OCR) feeding the same
   endpoint.
3. **Later (deferred):** code/editor capture (`filePath`/`line`); cloud sync;
   native/Electron shell.

## Out of Scope (for now)

- Live highlight overlays re-rendered on the original source.
- Code/editor (VS Code) capture.
- Multi-device sync.
- Graph view of note links (list only).
- Folders / collections (flat + tags + links instead).
- Task/status workflow on notes (reference-only).
- Filtered/subset export (export-all only).
