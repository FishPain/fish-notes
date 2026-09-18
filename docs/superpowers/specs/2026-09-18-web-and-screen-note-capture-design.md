# Web & Screen Note Capture — Design

**Date:** 2026-09-18
**Status:** Draft for review (revised to adopt-first architecture)

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

## Guiding principle (ponytail)

Most of this already exists as mature open source. **Adopt, don't rebuild.**
Phase 1 is pure adoption + configuration with **zero custom code**. We build the
few genuine gaps only in Phase 2, and only if the adopted stack falls short.

## Adopted components

- **Joplin** (github.com/laurent22/joplin, MIT, Electron, local **SQLite**) — the
  note store, desktop UI, tags, note links, full-text search, and import/export.
  It ships a **browser Web Clipper** (selection / screenshot / full page + source
  URL → local note) and a **Data API** on `http://localhost:41184` (token-guarded)
  for programmatic note creation. This is our engine + UI + web capture + organize
  + export — already built.
- **AI search + ask layer — pick one at setup:**
  - **Khoj** (github.com/khoj-ai/khoj, AGPL) — semantic search + chat over a
    markdown folder, local (Ollama) or cloud (**Claude**, GPT, …), self-hosted.
    Native Claude support; needs a Joplin→markdown-folder bridge to index.
  - **Jarvis** (Joplin plugin, JS/TS) — semantic search + chat *inside* Joplin,
    indexes notes directly (no bridge). Stays in the JS/TS ecosystem; confirm
    Claude support at setup (else use an OpenAI-compatible gateway or Ollama).
  - Default recommendation: **Khoj** for native Claude; **Jarvis** if you prefer
    zero bridging and in-app.

## Core decisions (settled during brainstorming)

- **Viewing model:** view the captured passage + note together in one searchable
  place with a best-effort "jump to source" link. No live highlight overlay.
- **Capture is decoupled from storage:** capturers POST notes to Joplin's Data
  API (`localhost:41184`, token). Same target for every capturer.
- **AI is hybrid:** semantic search/embeddings local; question answering local
  (Ollama) or cloud (Claude), a config choice in Khoj/Jarvis.
- **No always-on service of our own:** Joplin is a normal desktop app you open;
  its clipper service + Data API run while Joplin is open. Khoj runs when you
  want AI search (self-hosted locally).

## Architecture

```
   Browser  ── Joplin Web Clipper (Phase 1) ─┐
                                             │  POST notes (token)
   Browser  ── box-draw capturer (Phase 2) ──┤────────────────┐
   Screen   ── screen-box OCR helper (Phase 2)┘                ▼
                                          ┌───────────────────────────────┐
                                          │ JOPLIN (desktop, local SQLite) │
                                          │  Data API :41184 (token)       │
                                          │  UI: browse/search/tags/links  │
                                          │  export: md / jex              │
                                          └───────────────┬────────────────┘
                                                          │ notes (md folder or in-app)
                                                          ▼
                                          ┌───────────────────────────────┐
                                          │ Khoj (or Jarvis plugin)        │
                                          │  semantic search + ask          │
                                          │  local Ollama / cloud Claude    │
                                          └────────────────────────────────┘
```

## Phase 1 — adopt + configure (no custom code)

1. Install **Joplin desktop** + the **Web Clipper** browser extension; enable the
   clipper service (Joplin → Options → Web Clipper) and note the API token.
2. Use the clipper to capture selections/screenshots + source URL into local
   notes. Organise with Joplin tags and note links. Search with Joplin's search.
3. Stand up the **AI layer**:
   - **Khoj:** self-host (Docker or pip), bridge Joplin notes to a markdown folder
     (Joplin filesystem sync or periodic export), point Khoj at that folder,
     configure Ollama and/or a Claude API key. Search/chat via Khoj's UI.
   - **or Jarvis:** install the plugin in Joplin, configure provider (Claude via
     compatible endpoint, or Ollama), let it index notes; search/chat in Joplin.
4. Backup = Joplin's SQLite DB / export; export = Joplin md/jex. (Already covered.)

This is a complete, daily-usable tool with nothing built.

## Phase 2 — build only the gaps (Dylan code style, tested)

Built only if the adopted stack proves insufficient. Each POSTs to the Joplin
Data API, so Joplin remains the store/UI/search.

1. **Box-draw / precise-anchor browser capturer.** Joplin's clipper captures a
   selection but not a jump-to-exact-spot anchor. A small extension: draw a box
   (or select text) → read the real DOM text under it + surrounding paragraph +
   URL + a **`#:~:text=` scroll-to anchor** + optional screenshot → POST to the
   Joplin Data API. Enables true "jump back to that sentence."
2. **Screen-box OCR helper.** For non-web sources: transparent overlay → region
   screenshot → OCR (`tesseract.js`) → POST to Joplin Data API. (Joplin clips
   screenshots but does not OCR them to text.)
3. **Related-notes panel (optional).** Khoj/Jarvis already give semantic *search*;
   build a dedicated "related to this note" panel only if search isn't enough.

## Jump to Source

- **Web:** stored source URL (Joplin clipper) or `url + #:~:text=` anchor (Phase 2
  capturer) → reopen and scroll to the exact passage.
- **Screen/app (Phase 2):** screenshot + OCR text stand on their own.

## Out of Scope (for now)

- A custom note engine / storage / UI (Joplin provides these).
- A custom embeddings/search service (Khoj/Jarvis provide these).
- Live highlight overlays on the original source.
- Code/editor (VS Code) capture.
- Multi-device sync (use Joplin's own sync if needed later).

## Notes / risks

- **Joplin→Khoj bridge** (markdown folder) is the main integration friction; Jarvis
  avoids it by indexing in-app. Decide at setup.
- **Claude support:** native in Khoj; via compatible endpoint in Jarvis — verify.
- **AGPL (Khoj):** fine for personal self-hosted use; note the license if ever
  redistributing.
