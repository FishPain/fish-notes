# mynotes

Capture a thought tied to a *specific* sentence, line, or region on any web page
or screen — without altering the source — then find it again with normal and
**AI/semantic search**.

Instead of reinventing a note store, UI, and search engine, **mynotes stands on
mature open source** and adds only the missing pieces:

- **[Joplin](https://github.com/laurent22/joplin)** (MIT) — local note store
  (SQLite), desktop UI, tags, note links, full-text search, import/export, and a
  browser Web Clipper. Its **Data API** (`localhost:41184`) is the capture
  endpoint.
- **[Jarvis](https://github.com/alondmnt/joplin-plugin-jarvis)** (Joplin plugin,
  default) *or* **[Khoj](https://github.com/khoj-ai/khoj)** (AGPL, native Claude)
  — semantic search + ask over your notes, local (Ollama) or cloud (Claude).
- **mynotes (this repo, MIT)** — a small capturer that adds what the above lack:
  a **box-draw / precise text capture** that records a `#:~:text=` **scroll-to
  anchor** so you can jump back to the exact sentence, plus an optional
  **screen-region OCR** helper for non-web sources. Everything POSTs into Joplin.

> Licensing note: mynotes is MIT. It *talks to* Khoj (AGPL) as a separate process
> over HTTP and never bundles its code, so this repo stays MIT. Joplin and Jarvis
> are MIT-compatible.

## Status

- **Phase 1 (adopt + configure):** works today with zero custom code — see Setup.
- **Phase 2 (this repo's code):** the precise-anchor capturer + OCR helper. See
  `docs/superpowers/plans/2026-09-18-adopt-and-gaps.md`.

## Setup

### 1. Joplin + Web Clipper

1. Install Joplin desktop — `brew install --cask joplin` (macOS) or from
   [joplinapp.org](https://joplinapp.org).
2. Install the **Joplin Web Clipper** browser extension (linked from Joplin →
   Options → Web Clipper).
3. In Joplin → Options → Web Clipper, **enable** the service and copy the
   **Authorization token**.
4. Verify the Data API:
   ```bash
   curl -s "http://localhost:41184/ping"      # -> JoplinClipperServer
   ```

You can now clip selections/screenshots + source URL into local notes, and
organise them with tags and note links.

### 2. AI search + ask

**Default — Jarvis (in-Joplin, lowest friction):**
1. Joplin → Options → Plugins → install **Jarvis**.
2. Configure a provider (Claude via a compatible endpoint, or **Ollama** for
   fully local) + API key.
3. Run Jarvis "update note database", then search/chat over your notes in Joplin.

**Alternative — Khoj (native Claude, self-hosted):**
1. Self-host Khoj (Docker or `pip install khoj`).
2. Point Joplin's File-system sync (or a scheduled Markdown export) at a folder,
   and add that folder as a Khoj markdown source.
3. Enable Ollama and/or a Claude API key in Khoj; search/chat via Khoj's UI.

### 3. (Optional) mynotes capturer — Phase 2

Only needed if you want jump-to-exact-sentence anchors, box-draw regions, or
screen OCR. Build/run instructions live in the Phase 2 plan.

## How it fits together

```
Browser / screen ──capture──▶ Joplin Data API (localhost:41184, token)
                                     │
                              Joplin (local SQLite, UI, search, export)
                                     │
                        Jarvis (in-app)  or  Khoj (semantic search + ask)
                                     └── local Ollama / cloud Claude
```

## Acknowledgements

Built on [Joplin](https://github.com/laurent22/joplin) (MIT),
[Khoj](https://github.com/khoj-ai/khoj) (AGPL-3.0), and
[Jarvis](https://github.com/alondmnt/joplin-plugin-jarvis).

## License

MIT — see [LICENSE](./LICENSE).
