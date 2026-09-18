# Phase 1b — Browser Capturer (MV3 extension) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Manifest V3 browser extension that captures a text selection (or box-drawn region) from any web page — the content, its surrounding context, the URL, and a `#:~:text=` jump-back anchor — and POSTs it to the local corpus engine's `/capture` endpoint, queuing offline captures until the engine is reachable.

**Architecture:** Pure, unit-tested modules (anchor builder, DOM-context extractor, payload builder, offline queue) plus thin MV3 glue (content script for the capture UI, background service worker for sending + queue, an options page for the engine URL + token). The pure modules take injected dependencies (a `sender` function, a `storage` object) so they test without a browser. The extension targets the engine from Phase 1a (`POST /capture`, `Authorization: Bearer <token>`).

**Tech Stack:** TypeScript, vitest + jsdom, Chrome MV3 APIs. Style: Dylan **standard/web dialect** — arrow-const, named exports, single quotes, **semicolons YES**, no trailing commas, 2-space, `constants.ts` config surface, no `any`, no `import type`, kebab-case files. (Note: this is the semicolon dialect, unlike the semicolon-free Electron engine.)

---

## Prerequisite

Phase 1a engine is merged. It exposes `POST http://localhost:7645/capture` guarded by `Authorization: Bearer <CANVAS_TOKEN>`, accepting:
```jsonc
{ "content": "...", "contextText": "...", "note": "...",
  "source": { "type": "web", "url": "...", "anchor": "#:~:text=..." },
  "screenshot": "<optional base64>", "tags": ["..."], "capturedAt": "ISO" }
```

## File Structure

```
capturer/
  package.json
  tsconfig.json
  vitest.config.ts
  .prettierrc          # semi:true, singleQuote:true, trailingComma:none
  src/
    constants.ts       # DEFAULT_ENGINE settings
    types.ts           # CapturePayload, EngineConfig
    anchor.ts          # buildTextFragment(text) -> '#:~:text=...'
    dom-context.ts     # extractSelection(selection) -> { content, contextText }
    payload.ts         # buildPayload(parts) -> CapturePayload
    queue.ts           # makeQueue(storage, sender) -> { enqueue, flush }
  extension/
    manifest.json      # MV3
    content.js         # selection/box capture UI -> message to background
    background.js      # receive -> send via queue -> POST engine
    options.html
    options.js         # persist engine URL + token to chrome.storage
  test/
    anchor.test.ts
    dom-context.test.ts
    payload.test.ts
    queue.test.ts
```

The pure `src/` modules are TypeScript + tested. The `extension/` glue is hand-written JS wiring verified manually (Task 7); it imports the built pure modules.

---

## Task 0: Scaffold

**Files:** Create `capturer/package.json`, `capturer/tsconfig.json`, `capturer/vitest.config.ts`, `capturer/.prettierrc`

- [ ] **Step 1: `capturer/package.json`**

```json
{
  "name": "canvas-notes-capturer",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=20 <25" },
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "@types/chrome": "^0.0.268",
    "@types/node": "^20.0.0",
    "jsdom": "^24.0.0",
    "typescript": "^5.4.0",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 2: `capturer/tsconfig.json`**

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

- [ ] **Step 3: `capturer/vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'jsdom'
  }
});
```

- [ ] **Step 4: `capturer/.prettierrc`**

```json
{ "semi": true, "singleQuote": true, "trailingComma": "none", "printWidth": 100 }
```

- [ ] **Step 5: Install + commit** (use Node 24: `export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use 24`)

```bash
cd capturer && npm install
git add capturer/package.json capturer/tsconfig.json capturer/vitest.config.ts capturer/.prettierrc capturer/package-lock.json
git commit -m "chore: scaffold capturer"
```

---

## Task 1: Types + constants

**Files:** Create `capturer/src/types.ts`, `capturer/src/constants.ts`

- [ ] **Step 1: `capturer/src/types.ts`**

```typescript
export interface EngineConfig {
  baseUrl: string;
  token: string;
}

export interface CapturePayload {
  content: string;
  contextText: string;
  note: string;
  source: {
    type: 'web';
    url: string;
    anchor: string;
  };
  screenshot: string | null;
  tags: string[];
  capturedAt: string;
}
```

- [ ] **Step 2: `capturer/src/constants.ts`**

```typescript
// Defaults; the options page overrides these into chrome.storage at runtime.
export const DEFAULT_ENGINE = {
  baseUrl: 'http://localhost:7645',
  token: ''
};
```

- [ ] **Step 3: Typecheck + commit** (Node 24)

```bash
cd capturer && npx tsc --noEmit
git add capturer/src/types.ts capturer/src/constants.ts
git commit -m "feat: capturer types and defaults"
```

---

## Task 2: Text-fragment anchor

**Files:** Create `capturer/src/anchor.ts`, Test `capturer/test/anchor.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// capturer/test/anchor.test.ts
import { describe, it, expect } from 'vitest';
import { buildTextFragment } from '../src/anchor.js';

describe('buildTextFragment', () => {
  it('encodes a short selection whole', () => {
    expect(buildTextFragment('the exact sentence')).toBe('#:~:text=the%20exact%20sentence');
  });

  it('uses start,end form for long selections', () => {
    const long = Array.from({ length: 30 }, (_, i) => `w${i}`).join(' ');
    const frag = buildTextFragment(long);
    expect(frag.startsWith('#:~:text=')).toBe(true);
    expect(frag).toContain(',');
    expect(frag).toContain('w0');
    expect(frag).toContain('w29');
  });

  it('returns empty string for blank input', () => {
    expect(buildTextFragment('   ')).toBe('');
  });
});
```

- [ ] **Step 2: Run, confirm fail:** `cd capturer && npx vitest run test/anchor.test.ts` (Node 24)

- [ ] **Step 3: Implement `capturer/src/anchor.ts`**

```typescript
// Build a URL text fragment (https://wicg.github.io/scroll-to-text-fragment/).
// Short selections encode whole; long ones use textStart,textEnd to stay compact.
const MAX_WHOLE_WORDS = 10;

export const buildTextFragment = (selection: string): string => {
  const text = selection.trim().replace(/\s+/g, ' ');
  if (!text) return '';
  const words = text.split(' ');
  if (words.length <= MAX_WHOLE_WORDS) {
    return `#:~:text=${encodeURIComponent(text)}`;
  }
  const start = words.slice(0, 4).join(' ');
  const end = words.slice(-4).join(' ');
  return `#:~:text=${encodeURIComponent(start)},${encodeURIComponent(end)}`;
};
```

- [ ] **Step 4: Run, confirm pass.**

- [ ] **Step 5: Commit**

```bash
git add capturer/src/anchor.ts capturer/test/anchor.test.ts
git commit -m "feat: text-fragment anchor builder"
```

---

## Task 3: DOM context extraction

**Files:** Create `capturer/src/dom-context.ts`, Test `capturer/test/dom-context.test.ts`

- [ ] **Step 1: Write the failing test** (build DOM with the API, not innerHTML)

```typescript
// capturer/test/dom-context.test.ts
import { describe, it, expect } from 'vitest';
import { extractSelection } from '../src/dom-context.js';

describe('extractSelection', () => {
  it('returns selected text and the enclosing block as context', () => {
    const p = document.createElement('p');
    p.textContent = 'First sentence. Target sentence here. Third sentence.';
    const article = document.createElement('article');
    article.appendChild(p);
    document.body.replaceChildren(article);

    const textNode = p.firstChild as Text;
    const full = textNode.textContent as string;
    const startIdx = full.indexOf('Target');
    const range = document.createRange();
    range.setStart(textNode, startIdx);
    range.setEnd(textNode, startIdx + 'Target sentence here.'.length);

    const sel = window.getSelection() as Selection;
    sel.removeAllRanges();
    sel.addRange(range);

    const result = extractSelection(sel);
    expect(result.content).toBe('Target sentence here.');
    expect(result.contextText).toContain('First sentence');
    expect(result.contextText).toContain('Third sentence');
  });

  it('returns empty content when nothing is selected', () => {
    const sel = window.getSelection() as Selection;
    sel.removeAllRanges();
    expect(extractSelection(sel).content).toBe('');
  });
});
```

- [ ] **Step 2: Run, confirm fail.**

- [ ] **Step 3: Implement `capturer/src/dom-context.ts`**

```typescript
export interface SelectionResult {
  content: string;
  contextText: string;
}

// content = the selected text; contextText = the nearest block ancestor's text,
// giving the surrounding paragraph/section without the whole document.
export const extractSelection = (selection: Selection | null): SelectionResult => {
  if (!selection || selection.rangeCount === 0) {
    return { content: '', contextText: '' };
  }
  const range = selection.getRangeAt(0);
  const content = range.toString().trim();
  if (!content) return { content: '', contextText: '' };

  const container = range.commonAncestorContainer;
  const element =
    container.nodeType === Node.TEXT_NODE ? container.parentElement : (container as Element);
  const block = element?.closest('p, li, blockquote, article, section, main, div') ?? element;
  const contextText = (block?.textContent ?? content).trim().replace(/\s+/g, ' ');
  return { content, contextText };
};
```

- [ ] **Step 4: Run, confirm pass.**

- [ ] **Step 5: Commit**

```bash
git add capturer/src/dom-context.ts capturer/test/dom-context.test.ts
git commit -m "feat: DOM selection + enclosing-block context"
```

---

## Task 4: Payload builder

**Files:** Create `capturer/src/payload.ts`, Test `capturer/test/payload.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// capturer/test/payload.test.ts
import { describe, it, expect } from 'vitest';
import { buildPayload } from '../src/payload.js';

describe('buildPayload', () => {
  it('assembles a CapturePayload with a web source and ISO timestamp', () => {
    const p = buildPayload({
      content: 'the passage',
      contextText: 'the surrounding paragraph',
      note: 'my thought',
      url: 'https://ex.com/a',
      anchor: '#:~:text=the%20passage',
      screenshot: null,
      tags: ['x']
    });
    expect(p.source).toEqual({ type: 'web', url: 'https://ex.com/a', anchor: '#:~:text=the%20passage' });
    expect(p.content).toBe('the passage');
    expect(p.note).toBe('my thought');
    expect(p.tags).toEqual(['x']);
    expect(new Date(p.capturedAt).toString()).not.toBe('Invalid Date');
  });

  it('defaults optional fields', () => {
    const p = buildPayload({ content: 'x', contextText: '', url: 'https://e.com', anchor: '' });
    expect(p.note).toBe('');
    expect(p.screenshot).toBeNull();
    expect(p.tags).toEqual([]);
  });
});
```

- [ ] **Step 2: Run, confirm fail.**

- [ ] **Step 3: Implement `capturer/src/payload.ts`**

```typescript
import { CapturePayload } from './types.js';

interface PayloadParts {
  content: string;
  contextText: string;
  url: string;
  anchor: string;
  note?: string;
  screenshot?: string | null;
  tags?: string[];
}

export const buildPayload = (parts: PayloadParts): CapturePayload => ({
  content: parts.content,
  contextText: parts.contextText,
  note: parts.note ?? '',
  source: { type: 'web', url: parts.url, anchor: parts.anchor },
  screenshot: parts.screenshot ?? null,
  tags: parts.tags ?? [],
  capturedAt: new Date().toISOString()
});
```

- [ ] **Step 4: Run, confirm pass.**

- [ ] **Step 5: Commit**

```bash
git add capturer/src/payload.ts capturer/test/payload.test.ts
git commit -m "feat: capture payload builder"
```

---

## Task 5: Offline queue

**Files:** Create `capturer/src/queue.ts`, Test `capturer/test/queue.test.ts`

The queue depends on an injected `storage` (matching `chrome.storage.local`'s get/set shape) and a `sender` (POSTs one payload, resolves on success, rejects on failure). This makes it testable without Chrome.

- [ ] **Step 1: Write the failing test**

```typescript
// capturer/test/queue.test.ts
import { describe, it, expect, vi } from 'vitest';
import { makeQueue } from '../src/queue.js';
import { CapturePayload } from '../src/types.js';

const payload = (content: string): CapturePayload => ({
  content,
  contextText: '',
  note: '',
  source: { type: 'web', url: 'https://e.com', anchor: '' },
  screenshot: null,
  tags: [],
  capturedAt: '2026-09-18T00:00:00.000Z'
});

const memStorage = () => {
  let data: Record<string, unknown> = {};
  return {
    async get(key: string) {
      return { [key]: data[key] };
    },
    async set(obj: Record<string, unknown>) {
      data = { ...data, ...obj };
    },
    _dump: () => data
  };
};

describe('makeQueue', () => {
  it('sends immediately when the sender succeeds (nothing left queued)', async () => {
    const storage = memStorage();
    const sender = vi.fn().mockResolvedValue(undefined);
    const q = makeQueue(storage, sender);
    await q.enqueue(payload('a'));
    expect(sender).toHaveBeenCalledTimes(1);
    const stored = (await storage.get('queue')).queue as unknown[];
    expect(stored ?? []).toEqual([]);
  });

  it('persists on failure and flushes later when the sender recovers', async () => {
    const storage = memStorage();
    const sender = vi
      .fn()
      .mockRejectedValueOnce(new Error('engine down'))
      .mockResolvedValue(undefined);
    const q = makeQueue(storage, sender);

    await q.enqueue(payload('a')); // fails -> queued
    let stored = (await storage.get('queue')).queue as unknown[];
    expect(stored).toHaveLength(1);

    await q.flush(); // sender now succeeds
    stored = (await storage.get('queue')).queue as unknown[];
    expect(stored).toEqual([]);
    expect(sender).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run, confirm fail.**

- [ ] **Step 3: Implement `capturer/src/queue.ts`**

```typescript
import { CapturePayload } from './types.js';

export interface QueueStorage {
  get(key: string): Promise<Record<string, unknown>>;
  set(obj: Record<string, unknown>): Promise<void>;
}

export type Sender = (payload: CapturePayload) => Promise<void>;

const KEY = 'queue';

export const makeQueue = (storage: QueueStorage, sender: Sender) => {
  const read = async (): Promise<CapturePayload[]> => {
    const got = await storage.get(KEY);
    return (got[KEY] as CapturePayload[]) ?? [];
  };
  const write = (items: CapturePayload[]) => storage.set({ [KEY]: items });

  // Try to send; on failure, persist to the queue so nothing is lost.
  const enqueue = async (payload: CapturePayload): Promise<void> => {
    try {
      await sender(payload);
    } catch {
      const items = await read();
      items.push(payload);
      await write(items);
    }
  };

  // Drain queued items oldest-first; stop at the first failure and keep the rest.
  const flush = async (): Promise<void> => {
    const items = await read();
    const remaining = [...items];
    while (remaining.length > 0) {
      try {
        await sender(remaining[0]);
        remaining.shift();
      } catch {
        break;
      }
    }
    await write(remaining);
  };

  return { enqueue, flush };
};
```

- [ ] **Step 4: Run, confirm pass.**

- [ ] **Step 5: Commit**

```bash
git add capturer/src/queue.ts capturer/test/queue.test.ts
git commit -m "feat: offline capture queue with retry"
```

---

## Task 6: Full suite + typecheck (pure modules)

- [ ] **Step 1:** `cd capturer && npm test` (Node 24) → all pass.
- [ ] **Step 2:** `cd capturer && npx tsc --noEmit` → exit 0.
- [ ] **Step 3:** `git commit -am "test: capturer pure modules green"` (if anything to commit).

---

## Task 7: MV3 extension glue (manual verification)

**Files:** Create `capturer/extension/manifest.json`, `content.js`, `background.js`, `options.html`, `options.js`

The pure modules above are tested; this task is the browser wiring, verified by loading the unpacked extension.

- [ ] **Step 1: `capturer/extension/manifest.json`**

```json
{
  "manifest_version": 3,
  "name": "Canvas Notes Capturer",
  "version": "0.1.0",
  "permissions": ["activeTab", "scripting", "storage", "contextMenus"],
  "host_permissions": ["http://localhost:7645/*"],
  "background": { "service_worker": "background.js", "type": "module" },
  "options_page": "options.html",
  "commands": {
    "capture-selection": {
      "suggested_key": { "default": "Ctrl+Shift+S", "mac": "Command+Shift+S" },
      "description": "Capture the current selection"
    }
  },
  "content_scripts": [{ "matches": ["<all_urls>"], "js": ["content.js"] }]
}
```

- [ ] **Step 2: `capturer/extension/content.js`** — inline the pure logic (bundle `src/` with esbuild into `extension/`, or hand-inline `buildTextFragment` + `extractSelection` + `buildPayload`). On the `capture-selection` command (or a context-menu click), read `window.getSelection()`, build `{ content, contextText }` via `extractSelection`, `buildTextFragment(content)` for the anchor, capture `location.href`, show a tiny inline prompt for an optional note (Enter = save, Esc = save with empty note), assemble the payload via `buildPayload`, and `chrome.runtime.sendMessage({ type: 'capture', payload })`. Show a brief toast on success/queued.

- [ ] **Step 3: `capturer/extension/background.js`** — a module service worker. On install, create a context-menu item. Read `{ baseUrl, token }` from `chrome.storage.local` (fallback to `DEFAULT_ENGINE`). Build a `sender` that does `fetch(baseUrl + '/capture', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token }, body: JSON.stringify(payload) })` and rejects on non-2xx. Use `makeQueue(chrome.storage.local, sender)`. On `type:'capture'` messages call `queue.enqueue(payload)`; on startup and on a periodic alarm call `queue.flush()`.

- [ ] **Step 4: `capturer/extension/options.html` + `options.js`** — a form with Engine URL + Token fields; load current values from `chrome.storage.local`; save on submit. (The token is the engine's `CANVAS_TOKEN`.)

- [ ] **Step 5: Manual verification**
  1. Start the engine: `cd app && CANVAS_TOKEN=dev npx tsx src/index.ts` (Node 24).
  2. Load `capturer/extension/` as an unpacked extension (chrome://extensions → Developer mode → Load unpacked).
  3. Open the options page, set Engine URL `http://localhost:7645` and Token `dev`.
  4. On a real web page, select a sentence, trigger the capture command, add a note, save.
  5. Confirm: `curl -s "http://localhost:7645/search?q=<a word from the sentence>&mode=keyword" -H 'authorization: Bearer dev'` returns the capture, and its `source.anchor` starts with `#:~:text=`.
  6. Stop the engine, capture again (should queue), restart the engine, confirm the queued capture flushes (appears in search).

- [ ] **Step 6: Commit**

```bash
git add capturer/extension
git commit -m "feat: MV3 capturer extension wired to the engine"
```

---

## Self-review notes

- **Spec coverage:** selection capture + context (Task 3), `#:~:text=` anchor (Task 2), payload matching the engine's `CaptureInput` (Task 4), token-authorized POST + offline queue/flush (Tasks 5, 7), options for engine URL/token (Task 7). ✅
- **Deferred:** box-draw region capture and an auto screenshot (`chrome.tabs.captureVisibleTab`) — the selection path is the precise, higher-value one; add box-draw as an enhancement once selection capture is proven. Screenshot field is already supported end-to-end (nullable), so it can be filled later without schema change.
- **Style:** web dialect (semicolons ON), unlike the engine's desktop dialect.
```
