# Fish Notes

A search-first desktop app for turning everything you read into **grounded, searchable
knowledge**. Capture any region of your screen (OCR) — the source app and page URL are
detected automatically — and it all lands in one local, searchable corpus. Write **notes**
that the AI can draft and extend — grounded in what you actually captured.

Everything is local: a SQLite corpus with full-text search + vector embeddings. The LLM
runs through **your** OpenAI-compatible endpoint (a proxy, OpenAI, or anything that speaks
the same API) — configured in-app, no key baked into the build.

> Status: early / in development. Design notes live in [`docs/`](./docs).

## How it works

```
 Screen capture (OCR) ─┐
 Manual notes         ─┴─▶  Engine (127.0.0.1)  ─▶  SQLite: FTS5 + sqlite-vec
                               │                       │
                               ├─ keyword / hybrid search
                               ├─ grounded "ask" (RAG)
                               └─ note drafting + inline /llm
                               ▲
                    OpenAI-compatible proxy (chat · vision OCR · embeddings)
```

The desktop app (Electron + React) embeds a small Node engine (Express + better-sqlite3).
Captures are full-text indexed and embedded; notes are TipTap documents the AI contributes
to by insertion (a one-time draft, and an inline `/llm` command).

## Requirements

- **macOS** (screen-capture uses the native `screencapture`; the rest is cross-platform).
- **Node 24** — the native `better-sqlite3` addon is built against it (`app/.nvmrc`).
- An **OpenAI-compatible endpoint** + API key for chat, OCR (a vision model), and embeddings.

## Quick start

```bash
cd app
nvm use            # Node 24 (see app/.nvmrc)
npm install
npm run dev        # launches the Electron app (rebuilds better-sqlite3 for Electron first)
```

Configure the AI in-app: **gear → Settings** (proxy base URL, API key, chat model, OCR
model) → **Test connection** → **Save** → **Restart**. Settings persist to your user-data
folder. For dev you can instead copy `app/.env.example` → `app/.env` and fill it in.

### Build a macOS app

```bash
cd app
npm run icon       # regenerate the app icon (optional; native rsvg-convert + iconutil)
npm run package    # → app/dist/Fish Notes-<version>-arm64.dmg (ad-hoc signed)
```

The packaged app is ad-hoc signed for local use. It does **not** bundle your API key —
enter it in Settings after install.

## Development

```bash
cd app
npm test           # engine tests (vitest)
npm run typecheck  # tsc --noEmit
```

Native module note: `better-sqlite3` must be compiled for the runtime that loads it —
Node (tests/`start`) vs Electron (`dev`/`package`). The `dev`/`test`/`start` scripts run the
right rebuild automatically; if you hit an `ERR_DLOPEN_FAILED`, run `npm run rebuild:electron`
(for the app) or `npm run rebuild:node` (for tests).

## Tech

Electron · React · TypeScript · MUI · TanStack Query · zustand · TipTap · Express ·
better-sqlite3 + sqlite-vec (FTS5) · Vercel AI SDK (OpenAI-compatible).

## License

MIT — see [LICENSE](./LICENSE).
