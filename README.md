# Canvas Notes

A search-first desktop app for turning everything you read at work into
**self-organizing, grounded knowledge**. Capture passages from any web page or
screen without altering the source; they join one searchable corpus; and each
**canvas** (a topic you define) becomes a **living document** the app collates
from your saved sources — with every claim cited back to what you captured.

- **Capture anywhere** — select or box-draw on a page; it saves the content,
  surrounding context, source URL, and a `#:~:text=` jump-back anchor.
- **Search-first** — one bar to search your sources or **ask a question answered
  only from what you saved**, with citations.
- **Canvases = living documents** — the LLM drafts a working doc per topic from
  the relevant captures. **AI text refreshes; text you edit locks as yours.**
  Word-level provenance and inline citations (Google-Docs feel).
- **Self-contained & private** — local SQLite corpus, local embeddings, your
  choice of local (Ollama) or cloud (Claude) model. No server to run.

> Status: in development. See the design in
> [`docs/superpowers/specs`](./docs/superpowers/specs) and the build plan in
> [`docs/superpowers/plans`](./docs/superpowers/plans).

## How it works

```
Browser / screen ──capture──▶ Electron app
                                ├─ Corpus: SQLite (FTS5 + sqlite-vec embeddings)
                                ├─ Retrieval: hybrid keyword + semantic
                                ├─ Search + Ask: grounded answers with citations
                                └─ Canvas: living document (TipTap) — AI spans
                                   refresh, your edits lock, claims cite sources
                                LLM via Vercel AI SDK → Claude or Ollama
```

## Tech

Electron + React + TypeScript · MUI · TanStack Query · zustand · TipTap
(ProseMirror) · better-sqlite3 + sqlite-vec + FTS5 · `@xenova/transformers`
(local embeddings) · Vercel AI SDK (`@ai-sdk/anthropic` + Ollama) · vitest.

## License

MIT — see [LICENSE](./LICENSE).
