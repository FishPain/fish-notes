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
- **Capture is decoupled from the app.** While the app is running it exposes a
  local HTTP endpoint; any number of capturers POST the same note schema to it.
- **Two capturers ship** (browser first, then screen):
  - **Browser extension** — the priority, since web is the main source.
  - **Screen-box capture** — built into the Electron app (transparent overlay +
    screenshot + OCR) for non-web sources. Not a separate native app.
- **Code/editor capture is out of scope for now** (deferred; the same schema
  has room for `filePath`/`line` when we add it).
- **AI is hybrid:** embeddings + search always run **locally**; question
  answering can use **local (Ollama)** or **cloud (user API key)** per query.
- **LLM access uses the Vercel AI SDK (`ai`).** Cloud = Claude via
  `@ai-sdk/anthropic` (model id is config, e.g. `claude-sonnet-5`); local =
  Ollama community provider. Calling code is identical across providers
  (`generateText`/`streamText`), so **switching is a config choice, zero code
  change**. Node-native, no Python, no sidecar. (litellm was rejected as Python;
  the plain `openai` SDK + baseURL trick was rejected because Claude is the main
  cloud model and its native format differs from OpenAI's — only a caveated
  compat shim, not worth building on.)
- **Embeddings stay local and in-process** (`transformers.js`), separate from the
  LLM path, so core search works offline with no external deps (no Ollama
  required just to search). The AI SDK path is used only for the "ask" feature.
- **Phase 2 (screen capture) is pure Electron — no native Swift.** The macOS
  Accessibility API is reliable only on native Cocoa apps (Chromium/Electron
  apps and many cross-platform toolkits expose little/no usable text), so AX is
  not a dependable universal path. Instead: transparent overlay window +
  `desktopCapturer` screenshot + OCR (`tesseract.js`). A native AX helper is a
  possible *later* upgrade only if OCR accuracy proves insufficient.
- **The app is a normal Electron app you open — not a background service.**
  No always-on/launchd. When it's closed, the browser extension **queues
  captures locally and flushes them when you next open the app** (a just-clipped
  note isn't searchable until then — acceptable for a personal tool). Docker and
  an always-on launchd service were both considered and rejected as heavier than
  needed.
- **Stack: Electron, chosen for functionality.** The app bundles a Node
  **engine** (SQLite DB, local embeddings, search, LLM orchestration, and a
  capture listener while running) plus the **web UI**, in one app. Rationale:
  the high-value AI functionality (local embeddings, vector search, hybrid
  search, Q&A) has mature drop-in JS libraries (`transformers.js`, `sqlite-vec`)
  — far more functionality per unit effort than hand-rolling on Swift/CoreML.
- **Phase 2 screen capture lives in the same Electron app.** (A native SwiftUI
  app / AX helper was considered; it wins only on "native feel"/WidgetKit and
  AX-quality text — deprioritized in favor of functionality and one stack.)

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
        │  ELECTRON APP  (opened by user)       │
        │  Node engine:                         │
        │  - HTTP capture listener (while open) │
        │  - SQLite: notes, FTS5, vec           │
        │  - local embeddings (transformers.js) │
        │  - screen-box capture (Phase 2:       │
        │    overlay + desktopCapturer + OCR)   │
        │  Web UI (in the app window):          │
        │  - browse / search / ask / edit       │
        └───────────────┬──────────────────────┘
                        │ Vercel AI SDK, provider by config (ask only)
                        ▼
              ┌───────────────────────────────┐
              │ Claude (@ai-sdk/anthropic)     │
              │  or Ollama (local)             │
              └───────────────────────────────┘
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

### 1. Electron app — engine + UI — Phase 1

The Node engine runs inside the Electron main process; the UI is the renderer.
The HTTP capture listener is active only while the app is open.

- **HTTP API** (local, active while app is open):
  - `POST /capture` — validate, store, embed. Requires shared token.
  - `GET  /search?q=&mode=normal|semantic|hybrid&filters…`
  - `POST /ask` — retrieve top-k notes, answer via local or cloud LLM, return
    answer + source note links.
  - `GET/PATCH/DELETE /notes/:id` — view, edit note text/tags, delete.
  - `GET  /notes/:id/related` — top-k semantically similar notes.
  - `POST/DELETE /notes/:id/links` — manage manual links (backlinks).
  - `GET  /export?format=markdown|json` — export all notes.
- **Storage** (SQLite file in `~/Library/Application Support/`, survives restarts):
  - `notes` — schema fields (incl. `tags`) + `id`.
  - `notes_fts` (FTS5) — keyword search.
  - `vec_notes` (sqlite-vec) — one embedding per note (also powers "related notes").
  - `note_links` — manual explicit links (`from_id`, `to_id`).
- **Embeddings:** local small model (e.g. `all-MiniLM-L6-v2`) in-process via
  `transformers.js`. Nothing leaves the machine for indexing/search; no external
  service required.
- **LLM for /ask:** the **Vercel AI SDK (`ai`)** with `@ai-sdk/anthropic`
  (Claude) and an Ollama provider. Provider + model id are config; calling code
  is identical, so switching is config-only. API keys stored locally.

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
- POSTs to the app with the shared token.
- **App closed / unreachable:** queue in `chrome.storage` and flush when the app
  is next open, so a capture is never lost.

### 3. UI (Electron renderer) — Phase 1

- List/browse notes (newest first), filter by date / source type / domain / tag.
- Normal + semantic + hybrid search box.
- "Ask a question" panel (choose local/cloud).
- Open a note: see content, contextText, screenshot, note; edit note & tags;
  delete; **jump to source**; a **related notes** list (auto, semantic) and any
  **linked notes** (manual backlinks) with an "add link" action.
- Export all as markdown or JSON.

### 4. Screen-box capture (in the Electron app) — Phase 2

- Global hotkey → Electron opens a transparent, always-on-top, full-screen
  overlay window → draw rectangle.
- `desktopCapturer` screenshots the boxed region (needs macOS **Screen
  Recording** permission, granted once).
- **OCR** the screenshot to text via `tesseract.js` (local); the image is kept
  regardless. Best-effort `appName`/`windowTitle` from the frontmost window.
- Writes a note with the same schema directly to the engine (in-process).
- No native Swift / AX. (Later upgrade path: a native AX helper for
  AX-quality text on native apps, only if OCR proves insufficient.)

## Data Flow

Capturer builds note JSON → `POST /capture` (with token) → engine validates →
insert into `notes`, update `notes_fts`, compute + store embedding in
`vec_notes` → note visible in UI immediately.

## Search & AI

- **Normal:** FTS5 + filters (date, source type, domain/app, tag).
- **Semantic:** embed query → sqlite-vec top-k → merge with keyword hits (hybrid
  by default).
- **Ask:** retrieve top-k relevant notes → send *only those* to the answerer
  via the Vercel AI SDK (Claude or local Ollama, by config) → return answer +
  links to the source notes.

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
- **Backup:** single machine; the SQLite file lives in `~/Library/Application
  Support/` — "backup" = copy that file (optionally an auto-export on a
  schedule). **No cloud sync** now; the DB path can later point at a synced
  folder (iCloud/Dropbox) for a second Mac, one engine at a time.
- **Export:** both **markdown** (readable) and **JSON** (full-fidelity backup)
  via `/export`. **Export-all** for now; filtered/subset export deferred.

## Error Handling / Sharp Edges

- **App closed at capture:** capturer queues locally and flushes on next app
  open. No lost captures.
- **Localhost trust boundary:** `/capture` requires a shared token set at
  install, so stray web pages / local processes can't inject notes. (Security —
  not skipped.)
- **Source changes/disappears:** `content` + `contextText` + `screenshot` are
  self-contained; jump-to-source is best-effort on top.
- **Screen Recording permission (Phase 2):** `desktopCapturer` needs it; prompt
  once, degrade gracefully (capture disabled) if denied.
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

1. **Phase 1 (first implementation plan):** Electron app (Node engine — API +
   SQLite + FTS5 + sqlite-vec + local embeddings — plus the web UI) + browser
   extension + hybrid search + ask (local + cloud). A complete, daily-usable tool.
2. **Phase 2:** in-app screen-box capture (Electron overlay + `desktopCapturer`
   + `tesseract.js` OCR).
3. **Later (deferred):** native AX helper (only if OCR is insufficient);
   code/editor capture (`filePath`/`line`); cloud sync; WidgetKit widget.

## Out of Scope (for now)

- Live highlight overlays re-rendered on the original source.
- Code/editor (VS Code) capture.
- Multi-device sync.
- Graph view of note links (list only).
- Folders / collections (flat + tags + links instead).
- Task/status workflow on notes (reference-only).
- Filtered/subset export (export-all only).
