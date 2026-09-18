# Adopt Joplin + Khoj/Jarvis, Build Only Gaps — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement the Phase 2 tasks. Steps use checkbox (`- [ ]`) syntax for tracking. Phase 1 is a setup runbook, not code.

**Goal:** Stand up a daily-usable capture → store → AI-search workflow by adopting Joplin (store/UI/clipper) + Khoj or Jarvis (semantic search + ask), then build only the genuine gaps.

**Architecture:** Joplin is the backend (local SQLite) and UI; its Data API on `localhost:41184` is the capture endpoint. Khoj (or the Jarvis Joplin plugin) provides semantic search + ask over the notes, local (Ollama) or cloud (Claude). Custom code is limited to Phase 2 gap fillers, each POSTing to the Joplin Data API.

**Tech Stack:** Joplin, Khoj (or Jarvis plugin), Ollama and/or Claude. Phase 2 custom code: TypeScript (Dylan conventions — arrow-const, named exports, single quotes + semicolons, no trailing commas, `constants.ts` config surface, yup, no `any`, no `import type`), MV3 browser extension, `tesseract.js`, vitest.

---

## Phase 1 — Adopt + configure (no custom code)

### Task 1: Install Joplin + Web Clipper

- [ ] **Step 1:** Install Joplin desktop (`brew install --cask joplin` or from joplinapp.org).
- [ ] **Step 2:** Install the Joplin Web Clipper browser extension (Chrome/Firefox store, linked from Joplin → Options → Web Clipper).
- [ ] **Step 3:** In Joplin → Options → Web Clipper, **enable** the clipper service. Copy the **Authorization token** shown there — save it; the Phase 2 capturers need it.
- [ ] **Step 4: Verify the Data API is reachable.**

Run:
```bash
curl -s "http://localhost:41184/ping"
```
Expected: `JoplinClipperServer`.

- [ ] **Step 5: Verify note creation via the Data API** (replace `TOKEN`):
```bash
curl -s -XPOST "http://localhost:41184/notes?token=TOKEN" \
  -H 'content-type: application/json' \
  -d '{"title":"api test","body":"created via data api"}'
```
Expected: JSON with an `id`. Confirm the note appears in Joplin.

### Task 2: Daily capture + organise (adopted, no build)

- [ ] **Step 1:** Clip a text selection from a web page with the Web Clipper → confirm the note (with source URL) lands in Joplin.
- [ ] **Step 2:** Clip a screenshot region → confirm it lands as a note with the image.
- [ ] **Step 3:** Add a Joplin **tag** to a note; create a **note link** between two notes (`Ctrl/Cmd+K` or drag). Confirm search + tag filtering work.
- [ ] **Step 4:** Confirm export: Joplin → File → Export → JEX (backup) and Markdown (readable). This satisfies the export requirement with no build.

### Task 3: Stand up the AI layer (choose Khoj or Jarvis)

Pick ONE. Khoj = native Claude, needs a notes-folder bridge. Jarvis = in-app, no bridge.

**Option A — Khoj (native Claude):**
- [ ] **Step 1:** Self-host Khoj (Docker per khoj-ai/khoj README, or `pip install khoj`).
- [ ] **Step 2:** Bridge Joplin notes to a markdown folder: Joplin → Options → Synchronisation → target **File system**, pointed at e.g. `~/joplin-md`. Sync. (Alternatively schedule a Markdown export.)
- [ ] **Step 3:** In Khoj settings, add that folder as a markdown content source; enable Ollama and/or paste a Claude API key.
- [ ] **Step 4: Verify** semantic search: query a concept you noted (not exact words) in Khoj and confirm the right note surfaces; ask a question and confirm a cited answer.

**Option B — Jarvis (in-Joplin):**
- [ ] **Step 1:** Joplin → Options → Plugins → install **Jarvis**.
- [ ] **Step 2:** Configure the model provider (Claude via a compatible endpoint, or Ollama for local) and API key in Jarvis settings.
- [ ] **Step 3:** Run Jarvis "update note database" to index notes.
- [ ] **Step 4: Verify** semantic search + chat over notes from inside Joplin.

### Task 4: Decide if gaps actually bite

- [ ] **Step 1:** Use the adopted stack for a few real sessions.
- [ ] **Step 2:** Only proceed to Phase 2 if you specifically miss: (a) jump-to-exact-sentence, (b) box-draw over regions, or (c) OCR of screen captures. If not — **stop here; the tool is done.**

---

## Phase 2 — Build only the gaps (Dylan style, tested)

Build these only if Task 4 says they bite. Each POSTs to the Joplin Data API, so Joplin stays the store/UI/search. Custom code lives under `capturer/`.

### File Structure (Phase 2)

```
capturer/
  package.json
  tsconfig.json
  vitest.config.ts
  src/
    constants.ts        # single config surface: JOPLIN base url + token
    anchor.ts           # buildTextFragment(selection) -> '#:~:text=...'
    dom-context.ts      # extractContext(range) -> { content, contextText }
    joplin-client.ts    # createNote(payload) -> POSTs to Joplin Data API
    types.ts            # CaptureContext, CapturePayload interfaces
  test/
    anchor.test.ts
    dom-context.test.ts
    joplin-client.test.ts
```

### Task 5: capturer scaffold + constants

**Files:**
- Create: `capturer/package.json`, `capturer/tsconfig.json`, `capturer/vitest.config.ts`
- Create: `capturer/src/constants.ts`

- [ ] **Step 1: Create `capturer/package.json`**

```json
{
  "name": "mynotes-capturer",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "yup": "^1.4.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "jsdom": "^24.0.0",
    "typescript": "^5.4.0",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 2: Create `capturer/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "lib": ["ES2022", "DOM"],
    "outDir": "dist"
  },
  "include": ["src", "test"]
}
```

- [ ] **Step 3: Create `capturer/vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'jsdom'
  }
});
```

- [ ] **Step 4: Create `capturer/src/constants.ts`** (single config surface — nothing else reads env)

```typescript
// constants.ts — the single config surface (Dylan convention).
export const JOPLIN = {
  baseUrl: 'http://localhost:41184',
  token: process.env.JOPLIN_TOKEN ?? ''
};
```

- [ ] **Step 5: Install + commit**

```bash
cd capturer && npm install
git add capturer/package.json capturer/tsconfig.json capturer/vitest.config.ts capturer/src/constants.ts
git commit -m "chore: scaffold capturer with constants config surface"
```

### Task 6: text-fragment anchor

**Files:**
- Create: `capturer/src/anchor.ts`
- Test: `capturer/test/anchor.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// capturer/test/anchor.test.ts
import { describe, it, expect } from 'vitest';
import { buildTextFragment } from '../src/anchor.js';

describe('buildTextFragment', () => {
  it('encodes a short selection into a text fragment', () => {
    expect(buildTextFragment('the exact sentence')).toBe('#:~:text=the%20exact%20sentence');
  });

  it('uses start,end form for long selections', () => {
    const long = Array.from({ length: 30 }, (_, i) => `w${i}`).join(' ');
    const frag = buildTextFragment(long);
    expect(frag.startsWith('#:~:text=')).toBe(true);
    expect(frag).toContain(','); // start,end pair
    expect(frag).toContain('w0');
    expect(frag).toContain('w29');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd capturer && npx vitest run test/anchor.test.ts`
Expected: FAIL — cannot find module `../src/anchor.js`.

- [ ] **Step 3: Write minimal implementation** (arrow-const, named export, semicolons)

```typescript
// capturer/src/anchor.ts
// Build a URL text fragment (https://wicg.github.io/scroll-to-text-fragment/).
// Short selections encode whole; long ones use textStart,textEnd to stay compact.
const MAX_WHOLE_WORDS = 10;

export const buildTextFragment = (selection: string): string => {
  const text = selection.trim().replace(/\s+/g, ' ');
  const words = text.split(' ');
  if (words.length <= MAX_WHOLE_WORDS) {
    return `#:~:text=${encodeURIComponent(text)}`;
  }
  const start = words.slice(0, 4).join(' ');
  const end = words.slice(-4).join(' ');
  return `#:~:text=${encodeURIComponent(start)},${encodeURIComponent(end)}`;
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd capturer && npx vitest run test/anchor.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add capturer/src/anchor.ts capturer/test/anchor.test.ts
git commit -m "feat: text-fragment anchor builder"
```

### Task 7: types + DOM context extraction

**Files:**
- Create: `capturer/src/types.ts`
- Create: `capturer/src/dom-context.ts`
- Test: `capturer/test/dom-context.test.ts`

- [ ] **Step 1: Create `capturer/src/types.ts`**

```typescript
// capturer/src/types.ts
export interface CaptureContext {
  content: string;
  contextText: string;
}

export interface CapturePayload {
  content: string;
  contextText: string;
  note: string;
  url: string;
  anchor: string;
  screenshot: string | null;
  capturedAt: string;
}
```

- [ ] **Step 2: Write the failing test**

```typescript
// capturer/test/dom-context.test.ts
import { describe, it, expect } from 'vitest';
import { extractContext } from '../src/dom-context.js';

describe('extractContext', () => {
  it('returns the selected text and its enclosing block as context', () => {
    // Build the DOM with the API (no innerHTML) so the fixture is explicit.
    const p = document.createElement('p');
    p.textContent = 'First sentence. Target sentence here. Third sentence.';
    const article = document.createElement('article');
    article.appendChild(p);
    document.body.replaceChildren(article);

    const textNode = p.firstChild!;
    const full = textNode.textContent!;
    const startIdx = full.indexOf('Target');
    const range = document.createRange();
    range.setStart(textNode, startIdx);
    range.setEnd(textNode, startIdx + 'Target sentence here.'.length);

    const result = extractContext(range);
    expect(result.content).toBe('Target sentence here.');
    expect(result.contextText).toContain('First sentence');
    expect(result.contextText).toContain('Third sentence');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd capturer && npx vitest run test/dom-context.test.ts`
Expected: FAIL — cannot find module `../src/dom-context.js`.

- [ ] **Step 4: Write minimal implementation**

```typescript
// capturer/src/dom-context.ts
import { CaptureContext } from './types.js';

// content = the selected text; contextText = the nearest block ancestor's text,
// giving the surrounding paragraph/section without the whole document.
export const extractContext = (range: Range): CaptureContext => {
  const content = range.toString().trim();
  const container = range.commonAncestorContainer;
  const element =
    container.nodeType === Node.TEXT_NODE ? container.parentElement : (container as Element);
  const block = element?.closest('p, li, blockquote, article, section, div') ?? element;
  const contextText = (block?.textContent ?? content).trim().replace(/\s+/g, ' ');
  return { content, contextText };
};
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd capturer && npx vitest run test/dom-context.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add capturer/src/types.ts capturer/src/dom-context.ts capturer/test/dom-context.test.ts
git commit -m "feat: DOM context extraction (selection + enclosing block)"
```

### Task 8: Joplin Data API client

**Files:**
- Create: `capturer/src/joplin-client.ts`
- Test: `capturer/test/joplin-client.test.ts`

- [ ] **Step 1: Write the failing test** (stub `fetch`, assert URL/body shape)

```typescript
// capturer/test/joplin-client.test.ts
import { describe, it, expect } from 'vitest';
import { createNote } from '../src/joplin-client.js';

describe('createNote', () => {
  it('POSTs a formatted note to the Joplin Data API with the token', async () => {
    const calls: { url: string; body: { body: string; source_url: string } }[] = [];
    const fakeFetch = (async (url: string, init: { body: string }) => {
      calls.push({ url, body: JSON.parse(init.body) });
      return { ok: true, json: async () => ({ id: 'abc123' }) };
    }) as unknown as typeof fetch;

    const id = await createNote(
      {
        content: 'the passage',
        contextText: 'the surrounding paragraph',
        note: 'my thought',
        url: 'https://ex.com/a',
        anchor: '#:~:text=the%20passage',
        screenshot: null,
        capturedAt: '2026-09-18T00:00:00.000Z'
      },
      { baseUrl: 'http://localhost:41184', token: 'T' },
      fakeFetch
    );

    expect(id).toBe('abc123');
    expect(calls[0].url).toContain('/notes?token=T');
    expect(calls[0].body.body).toContain('the passage');
    expect(calls[0].body.body).toContain('my thought');
    expect(calls[0].body.source_url).toBe('https://ex.com/a#:~:text=the%20passage');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd capturer && npx vitest run test/joplin-client.test.ts`
Expected: FAIL — cannot find module `../src/joplin-client.js`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// capturer/src/joplin-client.ts
import { CapturePayload } from './types.js';

interface JoplinConfig {
  baseUrl: string;
  token: string;
}

// Format a capture as a Joplin note body; store the precise anchor on source_url.
const toJoplinNote = (p: CapturePayload) => ({
  title: p.content.slice(0, 80),
  body: `> ${p.contextText}\n\n**${p.content}**\n\n${p.note}`.trim(),
  source_url: `${p.url}${p.anchor}`,
  user_created_time: Date.parse(p.capturedAt)
});

export const createNote = async (
  payload: CapturePayload,
  config: JoplinConfig,
  fetchImpl: typeof fetch = fetch
): Promise<string> => {
  const res = await fetchImpl(`${config.baseUrl}/notes?token=${config.token}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(toJoplinNote(payload))
  });
  if (!res.ok) throw new Error(`Joplin API error: ${res.status}`);
  const data = (await res.json()) as { id: string };
  return data.id;
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd capturer && npx vitest run test/joplin-client.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add capturer/src/joplin-client.ts capturer/test/joplin-client.test.ts
git commit -m "feat: Joplin Data API note client"
```

### Task 9: Wire into an MV3 extension (manual verification)

**Files:**
- Create: `capturer/extension/manifest.json`, `capturer/extension/content.js`, `capturer/extension/background.js`

The pure logic (anchor, dom-context, joplin-client) is tested above; the extension is thin glue verified manually.

- [ ] **Step 1:** Create `capturer/extension/manifest.json` (MV3): action + `activeTab` + `scripting` permissions, host permission for `http://localhost:41184/*`, a content script and a service worker. Bundle the three `src/` modules for the browser (esbuild/rollup or hand-inline).
- [ ] **Step 2:** `content.js`: on hotkey, let the user box-draw / select; build a `Range` → `extractContext(range)`, `buildTextFragment(range.toString())`, capture `location.href`; show a small inline note prompt (optional note; Enter save / Esc save-empty); send the `CapturePayload` to the background worker.
- [ ] **Step 3:** `background.js`: receive payload, call `createNote(payload, JOPLIN)`; on failure, queue in `chrome.storage` and retry when Joplin is reachable.
- [ ] **Step 4: Verify end-to-end:** load the unpacked extension, select a sentence on a long page, save a note, confirm it appears in Joplin with `source_url` ending in `#:~:text=…`, then click that URL and confirm the browser scrolls to the sentence.
- [ ] **Step 5: Commit**

```bash
git add capturer/extension
git commit -m "feat: MV3 box-draw capturer wired to Joplin"
```

### Task 10: Screen-box OCR helper (optional, only if needed)

- [ ] **Step 1:** Small Node/Electron tool (or Joplin plugin): global hotkey → transparent overlay → region screenshot (`desktopCapturer`) → OCR via `tesseract.js` → build a `CapturePayload` (url empty, note optional) → `createNote(...)` to Joplin. macOS Screen Recording permission required; degrade gracefully if denied.
- [ ] **Step 2:** Manual verification: OCR a region of a PDF, confirm the text lands as a Joplin note.

### Task 11: Full suite + typecheck

- [ ] **Step 1:** `cd capturer && npm test` → all pass.
- [ ] **Step 2:** `cd capturer && npm run typecheck` → no errors.
- [ ] **Step 3:** Commit any fixes.

---

## Notes

- Phase 1 alone may be the whole product. Do not build Phase 2 speculatively — only when a specific gap (Task 4) actually bites.
- Joplin token is the trust boundary for the Data API; keep it out of source (env → `constants.ts`).
- Code style for Phase 2 follows Dylan conventions: arrow-const, named exports, single quotes + semicolons, no trailing commas, `constants.ts` as the only config surface, yup for any request validation, no `any`, no `import type`.
