# Canvas Notes — Design

**Date:** 2026-09-18
**Status:** Draft for review (redesigned: search-first, canvas-based, RAG-grounded)

## Problem

While working — e.g. building a new agent and reading hundreds of internal docs
across many components — I capture passages from web pages, documents, and code
without altering the source. I don't want a wall of source cards; I want the
**content** to be self-organized and searchable, with the tool actively
**collating what I've saved into a working document per topic**, kept honest by
**grounding every claim in my saved sources**. I then refine that document,
search my sources, and ask questions answered only from what I've saved.

## Product model (validated via mockups)

- **Global corpus.** Every capture joins one searchable pool. Captures are never
  filed into a single place; they ground any canvas that finds them relevant.
- **Canvas = a topic/workspace I define** (e.g. "New Agent — internal systems").
  Its body is a **living document**, not a list of sources.
- **Living document, word-level (Google-Docs feel).** A continuous, editable
  rich-text document the LLM drafts from relevant captures. Provenance is
  **per span**: AI-written text updates on Refresh; **any span I edit becomes
  "mine" and is locked** from future refreshes. Claims carry **inline citations**
  back to the exact captures; selecting a span shows provenance + sources + a
  "pin as mine" action.
- **Search-first.** Search/ask sits on top of the UI and is the primary action.
  **Ask is grounded** in the saved corpus and answers with citations.
- **Self-organizing with human override.** Collation and citations are automatic;
  I can edit/pin text, exclude a source, rename/merge canvases.

## Architecture

A single **Electron + React desktop app**. After the redesign, whole-app adoption
(Joplin/Khoj) no longer fits — the word-level living-document + provenance +
citation-merge engine is the entire point and neither app provides it. We still
avoid rebuilding solved sub-problems by **adopting mature libraries** (embeddings,
vector store, editor, LLM SDK) rather than whole apps.

```
Browser / screen ──capture──▶ ┌───────────────────────────────────────────┐
                              │ ELECTRON APP (React renderer + Node main)   │
                              │                                             │
                              │  Capture intake ─▶ Corpus (SQLite):         │
                              │     captures + FTS5 + sqlite-vec embeddings │
                              │                                             │
                              │  Retrieval (hybrid: FTS + vector)           │
                              │      │                                      │
                              │      ├─▶ Search (top bar)                   │
                              │      ├─▶ Ask (grounded answer + citations)  │
                              │      └─▶ Canvas collation engine ───────┐   │
                              │                                         ▼   │
                              │  Canvas doc store (per canvas):             │
                              │     rich-text + per-span provenance +       │
                              │     citation ranges (locked vs AI)          │
                              │                                             │
                              │  LLM via Vercel AI SDK ─▶ Claude / Ollama   │
                              │  Editor: TipTap/ProseMirror (custom marks)  │
                              └─────────────────────────────────────────────┘
```

## Components

### 1. Capture (browser extension, + later screen OCR)
- Box-draw / text-select on a page → real DOM text + surrounding context + URL +
  `#:~:text=` scroll-to anchor + optional screenshot → POST to the app's local
  intake endpoint (token-guarded). Offline queue + flush.
- Phase 2: screen-region OCR helper for non-web sources (overlay +
  `desktopCapturer` + `tesseract.js`).

### 2. Corpus store + retrieval (Node main process)
- **SQLite** as the source of truth: `captures` (content, contextText, note,
  source{url,anchor,appName,…}, tags, capturedAt), **FTS5** for keyword,
  **sqlite-vec** for embeddings. Markdown export for portability/backup.
- **Embeddings** local & in-process via `@xenova/transformers`
  (`all-MiniLM-L6-v2`) — no external service, offline.
- **Retrieval:** hybrid keyword + vector; returns captures with scores. Reused by
  search, ask, and canvas collation.

### 3. Canvas collation engine (the custom core)
- Per canvas: retrieve top-k relevant captures for the topic → LLM synthesizes a
  document with **inline citations** to those captures → **merge** into the
  existing canvas doc **preserving locked (user-edited) spans**, updating only
  AI spans and appending sections for new sources.
- **Provenance & citation model:** the canvas doc is stored as structured
  rich-text (ProseMirror JSON) where ranges carry marks: `origin: ai | user`
  and `citations: captureId[]`. Editing a range flips it to `user` (locked).
- **Merge (pragmatic v1):** sentence-level anchoring — treat user-locked
  sentences as fixed anchors; regenerate only the AI regions between them; never
  rewrite locked spans. (True word-level diff/merge is a later refinement.)
- **Trigger:** manual **Refresh** per canvas + a "N new sources since last
  refresh" nudge. Not on every capture (LLM cost).

### 4. Search & Ask (top bar)
- **Search:** hybrid retrieval over the corpus; results are content-first cards
  linking to source + canvases that cite them.
- **Ask:** retrieve top-k → LLM answers **grounded only in those captures** →
  answer with inline citations back to captures. Scope defaults to global; a
  canvas-scoped ask restricts to that topic's relevant sources.

### 5. UI (React renderer)
- **Top:** prominent search/ask (command-palette style).
- **Left:** canvases (create/rename/merge) + corpus count/all-captures search.
- **Main:** the open canvas's living document (TipTap/ProseMirror editor) with
  span provenance tints, inline citation superscripts (hover → capture), Refresh
  + new-source nudge, and a span popover (provenance / sources / pin).
- Light/dark, clean modern styling.

## Tech Stack (Dylan conventions)

- **App:** Electron + React + TypeScript. Arrow-const, named exports, single
  quotes + semicolons, no trailing commas, `constants.ts` single config surface,
  no `any`, no `import type`, kebab-case files.
- **UI libs:** MUI (`sx` only), TanStack Query over an `ApiClient.request()`
  wrapper, zustand for client state, framer-motion, FontAwesome, luxon.
- **Editor:** TipTap (ProseMirror) with custom marks for `origin` + `citations`.
- **Data/retrieval:** better-sqlite3, sqlite-vec, FTS5, `@xenova/transformers`.
- **LLM:** Vercel AI SDK (`ai`) + `@ai-sdk/anthropic` (Claude) + Ollama provider;
  provider/model is config, zero code change to switch.
- **Validation:** yup. **Logging:** bare `console.*`. **Tests:** vitest (kept).

## Open decision for review

- **Retrieval layer: self-contained (recommended) vs Khoj.** Recommendation:
  build retrieval in-app (transformers.js + sqlite-vec) so the OSS product is a
  **single install** with no Python/Docker dependency, and because collation
  needs custom LLM orchestration anyway. Khoj remains an optional alternative for
  users who already run it. (Confirm at review.)

## Distribution (open source)

- **MIT** repo under **github.com/fishpain**. Ships the whole app (no AGPL deps if
  self-contained retrieval is chosen). `README`, `LICENSE`, `.gitignore` in place.
- Publish via GitHub Desktop (FishPain account) or `gh` once authed to github.com.

## Phasing

1. **Phase 1 — corpus + retrieval + capture + search/ask.** Capture → SQLite
   (FTS + vec) → hybrid search + grounded ask with citations. A useful tool
   before canvases exist.
2. **Phase 2 — canvases + living document + collation/merge + provenance UI.**
   The custom core: TipTap editor, span provenance/citations, Refresh + merge.
3. **Phase 3 — screen-region OCR capture; polish; packaging/releases.**

## Risks / notes

- **Word-level merge is the hard part** — start at sentence-level anchoring;
  don't over-engineer the diff until the simple version bites.
- **Collation cost/latency** — manual Refresh + incremental (only new sources)
  keeps LLM usage bounded.
- **Citation fidelity** — the LLM must cite only retrieved captures; verify
  citations map to real captureIds and drop/repair hallucinated ones.

## Out of scope (for now)

- Forking Joplin or any app; live highlight overlays on the source; code/editor
  (VS Code) capture; multi-device sync.
