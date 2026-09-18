# Engine Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the headless note engine — store captured notes, search them (keyword + semantic + hybrid), surface related/linked notes, export, and answer questions — exposed over a local HTTP API.

**Architecture:** A TypeScript module with focused files (db, storage, embeddings, search, links, export, ask) wrapped by a small Express server. SQLite (`better-sqlite3`) holds notes, an FTS5 table for keyword search, and a `sqlite-vec` virtual table for embeddings. Embeddings are computed locally with `@xenova/transformers`. The "ask" feature routes through the Vercel AI SDK so Claude (cloud) or Ollama (local) is a config choice. This is Plan 1 of 3 for Phase 1 (the Electron shell/UI and the browser extension are separate plans that consume this engine).

**Tech Stack:** Node.js, TypeScript, better-sqlite3, sqlite-vec, SQLite FTS5, @xenova/transformers, Vercel AI SDK (`ai`, `@ai-sdk/anthropic`, `ollama-ai-provider`), express, vitest.

---

## File Structure

```
engine/
  package.json
  tsconfig.json
  vitest.config.ts
  src/
    types.ts        # Note, NoteInput, SearchResult types
    db.ts           # open DB, load sqlite-vec, run schema migrations
    storage.ts      # insertNote, getNote, updateNote, deleteNote
    embeddings.ts   # embed(text) -> number[] via transformers.js
    search.ts       # keywordSearch, semanticSearch, hybridSearch, relatedNotes
    links.ts        # addLink, removeLink, getLinks
    export.ts       # exportMarkdown, exportJson
    ask.ts          # ask(question) -> { answer, sources }
    server.ts       # express app: routes + token auth
    config.ts       # reads env: DB path, port, token, AI provider/model/keys
    generator.ts    # builds a provider-agnostic generate() from config
    index.ts        # entry point: wire config + generator + server
  test/
    *.test.ts
```

Each file has one responsibility. `db.ts` is the only file that opens the database; everything else takes a `Database` instance as a parameter so tests can pass an in-memory DB.

---

## Task 0: Project scaffold

**Files:**
- Create: `engine/package.json`
- Create: `engine/tsconfig.json`
- Create: `engine/vitest.config.ts`

- [ ] **Step 1: Create `engine/package.json`**

```json
{
  "name": "mynotes-engine",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "start": "tsx src/index.ts"
  },
  "dependencies": {
    "@ai-sdk/anthropic": "^1.0.0",
    "@xenova/transformers": "^2.17.2",
    "ai": "^4.0.0",
    "better-sqlite3": "^11.0.0",
    "express": "^4.19.2",
    "ollama-ai-provider": "^1.0.0",
    "sqlite-vec": "^0.1.6"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.0",
    "@types/express": "^4.17.21",
    "@types/node": "^20.0.0",
    "tsx": "^4.0.0",
    "typescript": "^5.4.0",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 2: Create `engine/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "outDir": "dist"
  },
  "include": ["src", "test"]
}
```

- [ ] **Step 3: Create `engine/vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    testTimeout: 30000, // embedding model load can be slow on first run
  },
});
```

- [ ] **Step 4: Install dependencies**

Run: `cd engine && npm install`
Expected: dependencies install without errors; `node_modules` created.

- [ ] **Step 5: Commit**

```bash
git add engine/package.json engine/tsconfig.json engine/vitest.config.ts
git commit -m "chore: scaffold engine project"
```

---

## Task 1: Types

**Files:**
- Create: `engine/src/types.ts`

- [ ] **Step 1: Create `engine/src/types.ts`**

```typescript
export interface NoteSource {
  type: 'web' | 'app';
  url?: string;
  scrollAnchor?: string;
  appName?: string;
  windowTitle?: string;
  filePath?: string; // reserved for future code capture
  line?: number;     // reserved
}

// What a capturer POSTs. No id/embedding yet.
export interface NoteInput {
  content: string;
  contextText?: string;
  note?: string;
  source: NoteSource;
  screenshot?: string; // base64 data URL, optional
  tags?: string[];
  capturedAt?: string; // ISO; server fills if missing
}

// A stored note as returned by the API.
export interface Note {
  id: number;
  content: string;
  contextText: string;
  note: string;
  source: NoteSource;
  screenshot: string | null;
  tags: string[];
  capturedAt: string;
}

export interface SearchResult {
  note: Note;
  score: number; // higher = more relevant
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `cd engine && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add engine/src/types.ts
git commit -m "feat: add engine note types"
```

---

## Task 2: Database open + schema

**Files:**
- Create: `engine/src/db.ts`
- Test: `engine/test/db.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// engine/test/db.test.ts
import { describe, it, expect } from 'vitest';
import { openDb } from '../src/db.js';

describe('openDb', () => {
  it('creates the required tables and loads sqlite-vec', () => {
    const db = openDb(':memory:');
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type IN ('table','view') ORDER BY name")
      .all()
      .map((r: any) => r.name);
    expect(tables).toContain('notes');
    expect(tables).toContain('notes_fts');
    expect(tables).toContain('note_links');
    expect(tables).toContain('vec_notes');
    // sqlite-vec must be loaded: this function only exists when the extension is present
    const v = db.prepare('SELECT vec_version() AS v').get() as { v: string };
    expect(typeof v.v).toBe('string');
    db.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd engine && npx vitest run test/db.test.ts`
Expected: FAIL — cannot find module `../src/db.js`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// engine/src/db.ts
import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';

const EMBED_DIM = 384; // all-MiniLM-L6-v2

export function openDb(path: string): Database.Database {
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  sqliteVec.load(db); // loads the vec0 extension into this connection
  migrate(db);
  return db;
}

function migrate(db: Database.Database): void {
  // better-sqlite3's exec() runs a batch of DDL statements (not a shell).
  db.exec(`
    CREATE TABLE IF NOT EXISTS notes (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      content      TEXT NOT NULL,
      contextText  TEXT NOT NULL DEFAULT '',
      note         TEXT NOT NULL DEFAULT '',
      source       TEXT NOT NULL DEFAULT '{}',
      screenshot   TEXT,
      tags         TEXT NOT NULL DEFAULT '[]',
      capturedAt   TEXT NOT NULL
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts
      USING fts5(note_id UNINDEXED, text);

    CREATE TABLE IF NOT EXISTS note_links (
      from_id INTEGER NOT NULL,
      to_id   INTEGER NOT NULL,
      PRIMARY KEY (from_id, to_id)
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS vec_notes
      USING vec0(note_id INTEGER PRIMARY KEY, embedding FLOAT[${EMBED_DIM}]);
  `);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd engine && npx vitest run test/db.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add engine/src/db.ts engine/test/db.test.ts
git commit -m "feat: open db, load sqlite-vec, create schema"
```

---

## Task 3: Embeddings

**Files:**
- Create: `engine/src/embeddings.ts`
- Test: `engine/test/embeddings.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// engine/test/embeddings.test.ts
import { describe, it, expect } from 'vitest';
import { embed } from '../src/embeddings.js';

describe('embed', () => {
  it('returns a 384-dim normalized vector', async () => {
    const v = await embed('hello world');
    expect(v).toHaveLength(384);
    const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
    expect(norm).toBeCloseTo(1, 2); // normalized
  });

  it('gives closer vectors for related text than unrelated', async () => {
    const dot = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i], 0);
    const cat = await embed('a fluffy domestic cat');
    const kitten = await embed('a small kitten');
    const finance = await embed('quarterly interest rate policy');
    expect(dot(cat, kitten)).toBeGreaterThan(dot(cat, finance));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd engine && npx vitest run test/embeddings.test.ts`
Expected: FAIL — cannot find module `../src/embeddings.js`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// engine/src/embeddings.ts
import { pipeline, type FeatureExtractionPipeline } from '@xenova/transformers';

let extractorPromise: Promise<FeatureExtractionPipeline> | null = null;

function getExtractor(): Promise<FeatureExtractionPipeline> {
  if (!extractorPromise) {
    extractorPromise = pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  }
  return extractorPromise;
}

export async function embed(text: string): Promise<number[]> {
  const extractor = await getExtractor();
  const output = await extractor(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data as Float32Array);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd engine && npx vitest run test/embeddings.test.ts`
Expected: PASS (first run downloads the model; allow time).

- [ ] **Step 5: Commit**

```bash
git add engine/src/embeddings.ts engine/test/embeddings.test.ts
git commit -m "feat: local embeddings via transformers.js"
```

---

## Task 4: Storage — insert / get / update / delete

**Files:**
- Create: `engine/src/storage.ts`
- Test: `engine/test/storage.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// engine/test/storage.test.ts
import { describe, it, expect } from 'vitest';
import { openDb } from '../src/db.js';
import { insertNote, getNote, updateNote, deleteNote } from '../src/storage.js';

describe('storage', () => {
  it('inserts and reads a note back with parsed source/tags', async () => {
    const db = openDb(':memory:');
    const id = await insertNote(db, {
      content: 'the mitochondria is the powerhouse of the cell',
      note: 'remember this',
      source: { type: 'web', url: 'https://bio.example/cell', scrollAnchor: '#:~:text=mitochondria' },
      tags: ['biology'],
    });
    const note = getNote(db, id)!;
    expect(note.content).toContain('mitochondria');
    expect(note.source.url).toBe('https://bio.example/cell');
    expect(note.tags).toEqual(['biology']);
    expect(note.capturedAt).toBeTruthy();
    db.close();
  });

  it('updates note text and tags only (content is immutable)', async () => {
    const db = openDb(':memory:');
    const id = await insertNote(db, { content: 'x', source: { type: 'web' } });
    updateNote(db, id, { note: 'edited', tags: ['a', 'b'] });
    const note = getNote(db, id)!;
    expect(note.note).toBe('edited');
    expect(note.tags).toEqual(['a', 'b']);
    expect(note.content).toBe('x');
    db.close();
  });

  it('deletes a note and its fts + vec rows', async () => {
    const db = openDb(':memory:');
    const id = await insertNote(db, { content: 'delete me', source: { type: 'web' } });
    deleteNote(db, id);
    expect(getNote(db, id)).toBeNull();
    const fts = db.prepare('SELECT count(*) AS c FROM notes_fts WHERE note_id = ?').get(id) as any;
    const vec = db.prepare('SELECT count(*) AS c FROM vec_notes WHERE note_id = ?').get(id) as any;
    expect(fts.c).toBe(0);
    expect(vec.c).toBe(0);
    db.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd engine && npx vitest run test/storage.test.ts`
Expected: FAIL — cannot find module `../src/storage.js`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// engine/src/storage.ts
import type Database from 'better-sqlite3';
import type { Note, NoteInput } from './types.js';
import { embed } from './embeddings.js';

function rowToNote(row: any): Note {
  return {
    id: row.id,
    content: row.content,
    contextText: row.contextText,
    note: row.note,
    source: JSON.parse(row.source),
    screenshot: row.screenshot,
    tags: JSON.parse(row.tags),
    capturedAt: row.capturedAt,
  };
}

// Text we index for keyword + semantic search.
function searchableText(n: { content: string; contextText?: string; note?: string }): string {
  return [n.content, n.contextText ?? '', n.note ?? ''].filter(Boolean).join('\n');
}

export async function insertNote(db: Database.Database, input: NoteInput): Promise<number> {
  const capturedAt = input.capturedAt ?? new Date().toISOString();
  const info = db
    .prepare(
      `INSERT INTO notes (content, contextText, note, source, screenshot, tags, capturedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.content,
      input.contextText ?? '',
      input.note ?? '',
      JSON.stringify(input.source),
      input.screenshot ?? null,
      JSON.stringify(input.tags ?? []),
      capturedAt
    );
  const id = Number(info.lastInsertRowid);

  const text = searchableText(input);
  db.prepare('INSERT INTO notes_fts (note_id, text) VALUES (?, ?)').run(id, text);

  const vector = await embed(text);
  db.prepare('INSERT INTO vec_notes (note_id, embedding) VALUES (?, ?)').run(
    id,
    JSON.stringify(vector)
  );

  return id;
}

export function getNote(db: Database.Database, id: number): Note | null {
  const row = db.prepare('SELECT * FROM notes WHERE id = ?').get(id);
  return row ? rowToNote(row) : null;
}

export function listNotes(db: Database.Database): Note[] {
  return db
    .prepare('SELECT * FROM notes ORDER BY capturedAt DESC')
    .all()
    .map(rowToNote);
}

// Only note + tags are editable; content/contextText are an immutable snapshot.
export function updateNote(
  db: Database.Database,
  id: number,
  patch: { note?: string; tags?: string[] }
): void {
  const current = getNote(db, id);
  if (!current) return;
  const note = patch.note ?? current.note;
  const tags = patch.tags ?? current.tags;
  db.prepare('UPDATE notes SET note = ?, tags = ? WHERE id = ?').run(note, JSON.stringify(tags), id);
  // keep FTS text in sync (note text changed)
  db.prepare('UPDATE notes_fts SET text = ? WHERE note_id = ?').run(
    searchableText({ content: current.content, contextText: current.contextText, note }),
    id
  );
}

export function deleteNote(db: Database.Database, id: number): void {
  db.prepare('DELETE FROM notes WHERE id = ?').run(id);
  db.prepare('DELETE FROM notes_fts WHERE note_id = ?').run(id);
  db.prepare('DELETE FROM vec_notes WHERE note_id = ?').run(id);
  db.prepare('DELETE FROM note_links WHERE from_id = ? OR to_id = ?').run(id, id);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd engine && npx vitest run test/storage.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add engine/src/storage.ts engine/test/storage.test.ts
git commit -m "feat: note storage (insert/get/update/delete) with fts+vec sync"
```

---

## Task 5: Search — keyword, semantic, hybrid

**Files:**
- Create: `engine/src/search.ts`
- Test: `engine/test/search.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// engine/test/search.test.ts
import { describe, it, expect } from 'vitest';
import { openDb } from '../src/db.js';
import { insertNote } from '../src/storage.js';
import { keywordSearch, semanticSearch, hybridSearch } from '../src/search.js';

async function seed() {
  const db = openDb(':memory:');
  await insertNote(db, { content: 'React hooks let you use state in function components', source: { type: 'web' } });
  await insertNote(db, { content: 'Sourdough bread needs a long fermentation', source: { type: 'web' } });
  await insertNote(db, { content: 'useEffect runs after render in React', source: { type: 'web' } });
  return db;
}

describe('search', () => {
  it('keyword search matches exact terms', async () => {
    const db = await seed();
    const results = keywordSearch(db, 'sourdough', 10);
    expect(results.map((r) => r.note.content).join(' ')).toContain('Sourdough');
    db.close();
  });

  it('semantic search finds conceptually related notes without shared words', async () => {
    const db = await seed();
    const results = await semanticSearch(db, 'managing component state in a UI framework', 3);
    expect(results[0].note.content).toMatch(/React|hooks|useEffect/);
    db.close();
  });

  it('hybrid search returns merged, de-duplicated results', async () => {
    const db = await seed();
    const results = await hybridSearch(db, 'React state', 10);
    const ids = results.map((r) => r.note.id);
    expect(new Set(ids).size).toBe(ids.length); // no dupes
    expect(results.length).toBeGreaterThan(0);
    db.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd engine && npx vitest run test/search.test.ts`
Expected: FAIL — cannot find module `../src/search.js`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// engine/src/search.ts
import type Database from 'better-sqlite3';
import type { SearchResult } from './types.js';
import { getNote } from './storage.js';
import { embed } from './embeddings.js';

function hydrate(db: Database.Database, rows: { note_id: number; score: number }[]): SearchResult[] {
  const results: SearchResult[] = [];
  for (const r of rows) {
    const note = getNote(db, r.note_id);
    if (note) results.push({ note, score: r.score });
  }
  return results;
}

export function keywordSearch(db: Database.Database, query: string, limit: number): SearchResult[] {
  // bm25() returns lower = better; negate so higher = better for a uniform score.
  const rows = db
    .prepare(
      `SELECT note_id, -bm25(notes_fts) AS score
       FROM notes_fts WHERE notes_fts MATCH ? ORDER BY score DESC LIMIT ?`
    )
    .all(query, limit) as { note_id: number; score: number }[];
  return hydrate(db, rows);
}

export async function semanticSearch(
  db: Database.Database,
  query: string,
  limit: number
): Promise<SearchResult[]> {
  const vector = await embed(query);
  const rows = db
    .prepare(
      `SELECT note_id, distance FROM vec_notes
       WHERE embedding MATCH ? ORDER BY distance LIMIT ?`
    )
    .all(JSON.stringify(vector), limit) as { note_id: number; distance: number }[];
  // distance smaller = closer; convert to a higher-is-better score.
  return hydrate(db, rows.map((r) => ({ note_id: r.note_id, score: 1 / (1 + r.distance) })));
}

// Hybrid: union of keyword + semantic, keep the best score per note.
export async function hybridSearch(
  db: Database.Database,
  query: string,
  limit: number
): Promise<SearchResult[]> {
  const [kw, sem] = await Promise.all([
    Promise.resolve(keywordSearch(db, query, limit)),
    semanticSearch(db, query, limit),
  ]);
  const best = new Map<number, SearchResult>();
  for (const r of [...kw, ...sem]) {
    const existing = best.get(r.note.id);
    if (!existing || r.score > existing.score) best.set(r.note.id, r);
  }
  return [...best.values()].sort((a, b) => b.score - a.score).slice(0, limit);
}

// Related notes: nearest neighbours to a given note's own embedding, excluding it.
export function relatedNotes(
  db: Database.Database,
  noteId: number,
  limit: number
): SearchResult[] {
  const row = db
    .prepare('SELECT embedding FROM vec_notes WHERE note_id = ?')
    .get(noteId) as { embedding: Buffer } | undefined;
  if (!row) return [];
  const rows = db
    .prepare(
      `SELECT note_id, distance FROM vec_notes
       WHERE embedding MATCH ? AND note_id != ? ORDER BY distance LIMIT ?`
    )
    .all(row.embedding, noteId, limit) as { note_id: number; distance: number }[];
  return hydrate(db, rows.map((r) => ({ note_id: r.note_id, score: 1 / (1 + r.distance) })));
}
```

Note: `relatedNotes` is synchronous — it reuses the stored embedding, so no model call is needed. It's included here (rather than a later task) because it lives in the same file; its dedicated test is Task 6.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd engine && npx vitest run test/search.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add engine/src/search.ts engine/test/search.test.ts
git commit -m "feat: keyword, semantic, hybrid search + relatedNotes"
```

---

## Task 6: Related notes test

**Files:**
- Test: `engine/test/related.test.ts` (implementation already added in Task 5)

- [ ] **Step 1: Write the failing test**

```typescript
// engine/test/related.test.ts
import { describe, it, expect } from 'vitest';
import { openDb } from '../src/db.js';
import { insertNote } from '../src/storage.js';
import { relatedNotes } from '../src/search.js';

describe('relatedNotes', () => {
  it('returns similar notes and excludes the note itself', async () => {
    const db = openDb(':memory:');
    const a = await insertNote(db, { content: 'React hooks and function component state', source: { type: 'web' } });
    await insertNote(db, { content: 'useEffect and useState in React', source: { type: 'web' } });
    await insertNote(db, { content: 'How to bake sourdough', source: { type: 'web' } });
    const results = relatedNotes(db, a, 5);
    expect(results.map((r) => r.note.id)).not.toContain(a);
    expect(results[0].note.content).toMatch(/React|useEffect|useState/);
    db.close();
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `cd engine && npx vitest run test/related.test.ts`
Expected: PASS (relatedNotes was implemented in Task 5).

- [ ] **Step 3: Commit**

```bash
git add engine/test/related.test.ts
git commit -m "test: related notes"
```

---

## Task 7: Manual links

**Files:**
- Create: `engine/src/links.ts`
- Test: `engine/test/links.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// engine/test/links.test.ts
import { describe, it, expect } from 'vitest';
import { openDb } from '../src/db.js';
import { insertNote } from '../src/storage.js';
import { addLink, removeLink, getLinks } from '../src/links.js';

describe('links', () => {
  it('adds links visible from both notes', async () => {
    const db = openDb(':memory:');
    const a = await insertNote(db, { content: 'A', source: { type: 'web' } });
    const b = await insertNote(db, { content: 'B', source: { type: 'web' } });
    addLink(db, a, b);
    expect(getLinks(db, a)).toContain(b); // outgoing
    expect(getLinks(db, b)).toContain(a); // backlink
    db.close();
  });

  it('adding the same link twice is idempotent, and removeLink removes it', async () => {
    const db = openDb(':memory:');
    const a = await insertNote(db, { content: 'A', source: { type: 'web' } });
    const b = await insertNote(db, { content: 'B', source: { type: 'web' } });
    addLink(db, a, b);
    addLink(db, a, b);
    expect(getLinks(db, a)).toEqual([b]);
    removeLink(db, a, b);
    expect(getLinks(db, a)).toEqual([]);
    db.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd engine && npx vitest run test/links.test.ts`
Expected: FAIL — cannot find module `../src/links.js`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// engine/src/links.ts
import type Database from 'better-sqlite3';

// Links are undirected in meaning: store one row, treat A-B and B-A as the same.
export function addLink(db: Database.Database, a: number, b: number): void {
  if (a === b) return;
  const [from, to] = a < b ? [a, b] : [b, a];
  db.prepare('INSERT OR IGNORE INTO note_links (from_id, to_id) VALUES (?, ?)').run(from, to);
}

export function removeLink(db: Database.Database, a: number, b: number): void {
  const [from, to] = a < b ? [a, b] : [b, a];
  db.prepare('DELETE FROM note_links WHERE from_id = ? AND to_id = ?').run(from, to);
}

// Return all note ids linked to the given note (either direction).
export function getLinks(db: Database.Database, id: number): number[] {
  const rows = db
    .prepare(
      `SELECT to_id AS other FROM note_links WHERE from_id = ?
       UNION SELECT from_id AS other FROM note_links WHERE to_id = ?`
    )
    .all(id, id) as { other: number }[];
  return rows.map((r) => r.other);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd engine && npx vitest run test/links.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add engine/src/links.ts engine/test/links.test.ts
git commit -m "feat: manual links between notes (undirected, idempotent)"
```

---

## Task 8: Export (markdown + JSON)

**Files:**
- Create: `engine/src/export.ts`
- Test: `engine/test/export.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// engine/test/export.test.ts
import { describe, it, expect } from 'vitest';
import { openDb } from '../src/db.js';
import { insertNote } from '../src/storage.js';
import { exportMarkdown, exportJson } from '../src/export.js';

describe('export', () => {
  it('markdown includes content, note, source url and tags', async () => {
    const db = openDb(':memory:');
    await insertNote(db, {
      content: 'the quoted passage',
      note: 'my thought',
      source: { type: 'web', url: 'https://ex.com/a' },
      tags: ['ideas'],
    });
    const md = exportMarkdown(db);
    expect(md).toContain('the quoted passage');
    expect(md).toContain('my thought');
    expect(md).toContain('https://ex.com/a');
    expect(md).toContain('ideas');
    db.close();
  });

  it('json round-trips every note as structured data', async () => {
    const db = openDb(':memory:');
    await insertNote(db, { content: 'x', source: { type: 'web' } });
    const parsed = JSON.parse(exportJson(db));
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0].content).toBe('x');
    db.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd engine && npx vitest run test/export.test.ts`
Expected: FAIL — cannot find module `../src/export.js`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// engine/src/export.ts
import type Database from 'better-sqlite3';
import { listNotes } from './storage.js';

export function exportJson(db: Database.Database): string {
  return JSON.stringify(listNotes(db), null, 2);
}

export function exportMarkdown(db: Database.Database): string {
  const blocks = listNotes(db).map((n) => {
    const src = n.source.url ?? n.source.appName ?? 'unknown source';
    const tags = n.tags.length ? `\nTags: ${n.tags.join(', ')}` : '';
    const note = n.note ? `\n\n${n.note}` : '';
    const quoted = n.content.split('\n').join('\n> ');
    return `## Note ${n.id} — ${n.capturedAt}\n\n> ${quoted}${note}\n\nSource: ${src}${tags}`;
  });
  return blocks.join('\n\n---\n\n') + '\n';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd engine && npx vitest run test/export.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add engine/src/export.ts engine/test/export.test.ts
git commit -m "feat: markdown and json export"
```

---

## Task 9: Config

**Files:**
- Create: `engine/src/config.ts`
- Test: `engine/test/config.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// engine/test/config.test.ts
import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/config.js';

describe('loadConfig', () => {
  it('reads defaults and env overrides', () => {
    const cfg = loadConfig({
      MYNOTES_PORT: '7777',
      MYNOTES_TOKEN: 'secret',
      MYNOTES_AI_PROVIDER: 'anthropic',
      MYNOTES_AI_MODEL: 'claude-sonnet-5',
    });
    expect(cfg.port).toBe(7777);
    expect(cfg.token).toBe('secret');
    expect(cfg.ai.provider).toBe('anthropic');
    expect(cfg.ai.model).toBe('claude-sonnet-5');
  });

  it('defaults provider to ollama when unset', () => {
    const cfg = loadConfig({ MYNOTES_TOKEN: 't' });
    expect(cfg.ai.provider).toBe('ollama');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd engine && npx vitest run test/config.test.ts`
Expected: FAIL — cannot find module `../src/config.js`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// engine/src/config.ts
export interface Config {
  port: number;
  token: string;
  dbPath: string;
  ai: {
    provider: 'anthropic' | 'ollama';
    model: string;
    anthropicApiKey?: string;
    ollamaBaseURL: string;
  };
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const provider = (env.MYNOTES_AI_PROVIDER as 'anthropic' | 'ollama') ?? 'ollama';
  return {
    port: Number(env.MYNOTES_PORT ?? 7777),
    token: env.MYNOTES_TOKEN ?? '',
    dbPath: env.MYNOTES_DB ?? 'mynotes.db',
    ai: {
      provider,
      model: env.MYNOTES_AI_MODEL ?? (provider === 'anthropic' ? 'claude-sonnet-5' : 'llama3.1'),
      anthropicApiKey: env.ANTHROPIC_API_KEY,
      ollamaBaseURL: env.OLLAMA_BASE_URL ?? 'http://localhost:11434/api',
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd engine && npx vitest run test/config.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add engine/src/config.ts engine/test/config.test.ts
git commit -m "feat: engine config from env"
```

---

## Task 10: Ask (retrieval + injectable generator)

**Files:**
- Create: `engine/src/ask.ts`
- Test: `engine/test/ask.test.ts`

The model call is injected so the test never hits a network/LLM. Production passes a real generate function built in Task 11.

- [ ] **Step 1: Write the failing test**

```typescript
// engine/test/ask.test.ts
import { describe, it, expect } from 'vitest';
import { openDb } from '../src/db.js';
import { insertNote } from '../src/storage.js';
import { ask } from '../src/ask.js';

describe('ask', () => {
  it('retrieves relevant notes, passes them to the generator, returns sources', async () => {
    const db = openDb(':memory:');
    await insertNote(db, { content: 'The deploy script runs migrations before starting the server', source: { type: 'web' } });
    await insertNote(db, { content: 'Cats sleep 16 hours a day', source: { type: 'web' } });

    let receivedPrompt = '';
    const fakeGenerate = async (prompt: string) => {
      receivedPrompt = prompt;
      return 'Migrations run first.';
    };

    const result = await ask(db, 'what happens during deploy?', fakeGenerate, 3);
    expect(receivedPrompt).toContain('migrations'); // relevant note included in context
    expect(result.answer).toBe('Migrations run first.');
    expect(result.sources.length).toBeGreaterThan(0);
    expect(result.sources[0].content).toMatch(/deploy|migrations/);
    db.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd engine && npx vitest run test/ask.test.ts`
Expected: FAIL — cannot find module `../src/ask.js`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// engine/src/ask.ts
import type Database from 'better-sqlite3';
import type { Note } from './types.js';
import { hybridSearch } from './search.js';

export type GenerateFn = (prompt: string) => Promise<string>;

export interface AskResult {
  answer: string;
  sources: Note[];
}

function buildPrompt(question: string, notes: Note[]): string {
  const context = notes
    .map((n, i) => `[${i + 1}] ${n.content}${n.note ? `\n(my note: ${n.note})` : ''}`)
    .join('\n\n');
  return `Answer the question using only these notes. Cite them by number.\n\nNOTES:\n${context}\n\nQUESTION: ${question}`;
}

export async function ask(
  db: Database.Database,
  question: string,
  generate: GenerateFn,
  k = 6
): Promise<AskResult> {
  const hits = await hybridSearch(db, question, k);
  const sources = hits.map((h) => h.note);
  const answer = await generate(buildPrompt(question, sources));
  return { answer, sources };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd engine && npx vitest run test/ask.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add engine/src/ask.ts engine/test/ask.test.ts
git commit -m "feat: ask (retrieval + injectable generator)"
```

---

## Task 11: Build the real generator from config

**Files:**
- Create: `engine/src/generator.ts`
- Test: `engine/test/generator.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// engine/test/generator.test.ts
import { describe, it, expect } from 'vitest';
import { makeGenerate } from '../src/generator.js';

describe('makeGenerate', () => {
  it('returns a callable generate function for the ollama provider', () => {
    const gen = makeGenerate({
      provider: 'ollama',
      model: 'llama3.1',
      ollamaBaseURL: 'http://localhost:11434/api',
    });
    expect(typeof gen).toBe('function');
  });

  it('returns a callable for anthropic when a key is present', () => {
    const gen = makeGenerate({
      provider: 'anthropic',
      model: 'claude-sonnet-5',
      anthropicApiKey: 'sk-test',
      ollamaBaseURL: 'http://localhost:11434/api',
    });
    expect(typeof gen).toBe('function');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd engine && npx vitest run test/generator.test.ts`
Expected: FAIL — cannot find module `../src/generator.js`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// engine/src/generator.ts
import { generateText } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOllama } from 'ollama-ai-provider';
import type { Config } from './config.js';
import type { GenerateFn } from './ask.js';

// Same calling code regardless of provider — provider choice is config only.
export function makeGenerate(ai: Config['ai']): GenerateFn {
  const model =
    ai.provider === 'anthropic'
      ? createAnthropic({ apiKey: ai.anthropicApiKey })(ai.model)
      : createOllama({ baseURL: ai.ollamaBaseURL })(ai.model);

  return async (prompt: string) => {
    const { text } = await generateText({ model, prompt });
    return text;
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd engine && npx vitest run test/generator.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add engine/src/generator.ts engine/test/generator.test.ts
git commit -m "feat: provider-agnostic generator via Vercel AI SDK"
```

---

## Task 12: HTTP API + token auth

**Files:**
- Create: `engine/src/server.ts`
- Test: `engine/test/server.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// engine/test/server.test.ts
import { describe, it, expect } from 'vitest';
import { openDb } from '../src/db.js';
import { createApp } from '../src/server.js';

const TOKEN = 'test-token';

function makeServer() {
  const db = openDb(':memory:');
  const app = createApp(db, { token: TOKEN, generate: async () => 'stub answer' });
  return app.listen(0); // ephemeral port
}

describe('server', () => {
  it('rejects /capture without a valid token (401)', async () => {
    const server = makeServer();
    const { port } = server.address() as any;
    const res = await fetch(`http://localhost:${port}/capture`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content: 'x', source: { type: 'web' } }),
    });
    expect(res.status).toBe(401);
    server.close();
  });

  it('accepts a capture with the token, then finds it via search', async () => {
    const server = makeServer();
    const { port } = server.address() as any;
    const base = `http://localhost:${port}`;
    const headers = { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` };

    const cap = await fetch(`${base}/capture`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ content: 'sourdough fermentation tips', source: { type: 'web' } }),
    });
    expect(cap.status).toBe(201);

    const search = await fetch(`${base}/search?q=sourdough&mode=keyword`, { headers });
    const results = await search.json();
    expect(results[0].note.content).toContain('sourdough');

    server.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd engine && npx vitest run test/server.test.ts`
Expected: FAIL — cannot find module `../src/server.js`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// engine/src/server.ts
import express, { type Request, type Response, type NextFunction } from 'express';
import type Database from 'better-sqlite3';
import type { GenerateFn } from './ask.js';
import { insertNote, getNote, updateNote, deleteNote, listNotes } from './storage.js';
import { keywordSearch, semanticSearch, hybridSearch, relatedNotes } from './search.js';
import { addLink, removeLink, getLinks } from './links.js';
import { exportMarkdown, exportJson } from './export.js';
import { ask } from './ask.js';

export interface AppDeps {
  token: string;
  generate: GenerateFn;
}

export function createApp(db: Database.Database, deps: AppDeps) {
  const app = express();
  app.use(express.json({ limit: '25mb' })); // screenshots can be large

  // Token auth on every route (localhost trust boundary).
  app.use((req: Request, res: Response, next: NextFunction) => {
    const auth = req.header('authorization') ?? '';
    if (auth !== `Bearer ${deps.token}`) return res.status(401).json({ error: 'unauthorized' });
    next();
  });

  app.post('/capture', async (req, res) => {
    const input = req.body;
    if (!input?.content || !input?.source?.type) {
      return res.status(400).json({ error: 'content and source.type are required' });
    }
    const id = await insertNote(db, input);
    res.status(201).json({ id });
  });

  app.get('/search', async (req, res) => {
    const q = String(req.query.q ?? '');
    const mode = String(req.query.mode ?? 'hybrid');
    const limit = Number(req.query.limit ?? 20);
    if (!q) return res.json([]);
    if (mode === 'keyword') return res.json(keywordSearch(db, q, limit));
    if (mode === 'semantic') return res.json(await semanticSearch(db, q, limit));
    return res.json(await hybridSearch(db, q, limit));
  });

  app.get('/notes', (_req, res) => res.json(listNotes(db)));

  app.get('/notes/:id', (req, res) => {
    const note = getNote(db, Number(req.params.id));
    return note ? res.json(note) : res.status(404).json({ error: 'not found' });
  });

  app.patch('/notes/:id', (req, res) => {
    updateNote(db, Number(req.params.id), { note: req.body.note, tags: req.body.tags });
    res.json(getNote(db, Number(req.params.id)));
  });

  app.delete('/notes/:id', (req, res) => {
    deleteNote(db, Number(req.params.id));
    res.status(204).end();
  });

  app.get('/notes/:id/related', (req, res) => {
    res.json(relatedNotes(db, Number(req.params.id), Number(req.query.limit ?? 5)));
  });

  app.get('/notes/:id/links', (req, res) => {
    const ids = getLinks(db, Number(req.params.id));
    res.json(ids.map((id) => getNote(db, id)).filter(Boolean));
  });

  app.post('/notes/:id/links', (req, res) => {
    addLink(db, Number(req.params.id), Number(req.body.to));
    res.status(201).end();
  });

  app.delete('/notes/:id/links/:to', (req, res) => {
    removeLink(db, Number(req.params.id), Number(req.params.to));
    res.status(204).end();
  });

  app.post('/ask', async (req, res) => {
    const result = await ask(db, String(req.body.question ?? ''), deps.generate);
    res.json(result);
  });

  app.get('/export', (req, res) => {
    const format = String(req.query.format ?? 'markdown');
    if (format === 'json') return res.type('application/json').send(exportJson(db));
    res.type('text/markdown').send(exportMarkdown(db));
  });

  return app;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd engine && npx vitest run test/server.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add engine/src/server.ts engine/test/server.test.ts
git commit -m "feat: express HTTP API with token auth"
```

---

## Task 13: Entry point (wire config + generator + server)

**Files:**
- Create: `engine/src/index.ts`

- [ ] **Step 1: Create `engine/src/index.ts`**

```typescript
// engine/src/index.ts
import { openDb } from './db.js';
import { loadConfig } from './config.js';
import { makeGenerate } from './generator.js';
import { createApp } from './server.js';

const cfg = loadConfig();
if (!cfg.token) {
  console.error('MYNOTES_TOKEN is required'); // trust boundary: no token, no server
  process.exit(1);
}
const db = openDb(cfg.dbPath);
const app = createApp(db, { token: cfg.token, generate: makeGenerate(cfg.ai) });
app.listen(cfg.port, () => console.log(`engine listening on http://localhost:${cfg.port}`));
```

- [ ] **Step 2: Smoke-test manually**

Run:
```bash
cd engine && MYNOTES_TOKEN=dev MYNOTES_DB=:memory: npx tsx src/index.ts
```
Expected: prints `engine listening on http://localhost:7777`. Leave it running for the next step; stop with Ctrl-C after.

- [ ] **Step 3: Verify a capture works end-to-end**

With the server running, in another terminal:
```bash
curl -s -XPOST http://localhost:7777/capture \
  -H 'authorization: Bearer dev' -H 'content-type: application/json' \
  -d '{"content":"hello note","source":{"type":"web","url":"https://x.com"}}'
```
Expected: `{"id":1}`.

- [ ] **Step 4: Commit**

```bash
git add engine/src/index.ts
git commit -m "feat: engine entry point"
```

---

## Task 14: Full suite + typecheck

- [ ] **Step 1: Run the whole suite**

Run: `cd engine && npm test`
Expected: all test files pass.

- [ ] **Step 2: Typecheck**

Run: `cd engine && npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit any fixes**

```bash
git add -A && git commit -m "test: full engine suite green"
```

---

## Notes for the next plans

- **Plan 2 (Electron shell + UI)** wraps `openDb` + `createApp` inside the Electron main process (`createApp(...).listen(port)` on a loopback port) and builds the renderer UI against these same HTTP routes.
- **Plan 3 (Browser extension)** POSTs to `/capture` with the shared token, and implements box-draw/text-select capture + an offline queue that flushes when the app is reachable.
- The shared token (`MYNOTES_TOKEN`) is generated once at install and shared between the engine and each capturer.
```
