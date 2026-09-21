# Phase 2a — Electron Shell + React Skeleton — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the headless engine into a real desktop app: an Electron window (React + MUI) that starts the engine in its main process and lets you search, ask, and browse captures — while the browser extension keeps working against the same local server.

**Architecture:** `app/` becomes the Electron desktop app. Electron **main** imports the existing engine (`openDb` + `buildServer`) and listens on a fixed loopback port with a **persisted token** (stored in Electron `userData`), so the extension still POSTs to it. **Preload** exposes `{ baseUrl, token }` to the renderer via `contextBridge`. The **renderer** (Vite + React + MUI + TanStack Query + zustand) calls the engine over HTTP through an `ApiClient` wrapper. `better-sqlite3` is rebuilt for Electron's ABI with `@electron/rebuild`. No canvases yet — this is the shell + corpus views; canvases come in 2b/2c.

**Tech Stack:** electron, electron-vite, react, react-dom, @mui/material + @emotion, @tanstack/react-query, zustand, @electron/rebuild, vitest. Style: desktop dialect (single quotes, **no semicolons**, no trailing commas, 2-space), arrow-const, named exports, `constants.ts` config surface, no `any`, no `import type`, kebab-case files, MUI `sx` only.

---

## Prerequisite / context

The engine (Phase 1a) lives in `app/src` and exports `openDb` (db.ts), `buildServer(db, generate, token)` (server.ts), `makeGenerate` (generator.ts), and reads config from `constants.ts`. It currently runs standalone via `app/src/index.ts`. This plan adds an Electron layer around it; `index.ts` stays usable for headless/dev runs.

New layout added under `app/`:
```
app/
  electron.vite.config.ts   # electron-vite: main / preload / renderer
  src/                       # (existing engine — unchanged)
  electron/
    main.ts                  # start engine server + create window
    preload.ts               # contextBridge: expose { baseUrl, token }
    engine-token.ts          # load-or-create persisted token
  renderer/
    index.html
    main.tsx                 # React root + QueryClient + MUI theme
    api-client.ts            # ApiClient.request wrapper (baseUrl+token)
    app.tsx                  # shell: search bar + results + ask + captures
    store.ts                 # zustand: current query/mode
  test/
    engine-token.test.ts
    api-client.test.ts
```

---

## Task 0: Electron + renderer dependencies and config

**Files:** Modify `app/package.json`; Create `app/electron.vite.config.ts`

- [ ] **Step 1: Add deps + scripts to `app/package.json`** (Node 24 for dev: `export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use 24`)

Add to `dependencies`: `"react": "^18.3.1"`, `"react-dom": "^18.3.1"`, `"@mui/material": "^5.16.0"`, `"@emotion/react": "^11.13.0"`, `"@emotion/styled": "^11.13.0"`, `"@tanstack/react-query": "^5.51.0"`, `"zustand": "^4.5.0"`.
Add to `devDependencies`: `"electron": "^31.0.0"`, `"electron-vite": "^2.3.0"`, `"vite": "^5.3.0"`, `"@vitejs/plugin-react": "^4.3.0"`, `"@electron/rebuild": "^3.6.0"`, `"@types/react": "^18.3.0"`, `"@types/react-dom": "^18.3.0"`.
Add scripts: `"dev": "electron-vite dev"`, `"build:app": "electron-vite build"`, `"rebuild:electron": "electron-rebuild -f -w better-sqlite3"`, `"rebuild:node": "npm rebuild better-sqlite3"`.
Keep existing `test`, `typecheck`, `start`. **Do NOT add a `postinstall` electron-rebuild.**

> **Native-module ABI note (important):** `better-sqlite3` compiles against ONE ABI. The engine's `vitest`/`tsx` run on **Node 24** and need the **Node-ABI** build (`npm run rebuild:node`, which is the default after `npm install`). The **Electron app** needs the **Electron-ABI** build (`npm run rebuild:electron`). So: rebuild for Electron only right before `npm run dev`, and rebuild for Node before running tests again. Production packaging (Phase 3, electron-builder) does the Electron rebuild automatically. This plan keeps the **Node-ABI** build during all build/test tasks and only switches to Electron-ABI in the manual run step (Task 5).

- [ ] **Step 2: Create `app/electron.vite.config.ts`**

```typescript
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: { build: { rollupOptions: { input: 'electron/main.ts' } } },
  preload: { build: { rollupOptions: { input: 'electron/preload.ts' } } },
  renderer: {
    root: 'renderer',
    build: { rollupOptions: { input: 'renderer/index.html' } },
    plugins: [react()]
  }
})
```

- [ ] **Step 3: Install (keep Node-ABI so tests still pass)**

Run: `cd app && npm install`
Expected: install completes. `npm install` builds `better-sqlite3` for the current Node (24) — leave it there so the existing suite keeps passing. Do NOT run `rebuild:electron` here (that's only for launching the app in Task 5). Verify the suite is still green: `npx vitest run` → all pass (if better-sqlite3 fails to load with `NODE_MODULE_VERSION`, run `npm run rebuild:node` and retry).

- [ ] **Step 4: Commit**

```bash
git add app/package.json app/package-lock.json app/electron.vite.config.ts
git commit -m "chore: add electron + renderer toolchain"
```

---

## Task 1: Persisted engine token

**Files:** Create `app/electron/engine-token.ts`; Test `app/test/engine-token.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// app/test/engine-token.test.ts
import { describe, it, expect } from 'vitest'
import { readFileSync, rmSync, mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { loadOrCreateToken } from '../electron/engine-token.js'

describe('loadOrCreateToken', () => {
  it('creates a token file on first call and reuses it after', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cn-'))
    const t1 = loadOrCreateToken(dir)
    expect(t1).toHaveLength(64) // 32 bytes hex
    const onDisk = readFileSync(join(dir, 'engine-token'), 'utf8').trim()
    expect(onDisk).toBe(t1)
    const t2 = loadOrCreateToken(dir)
    expect(t2).toBe(t1) // stable across calls
    rmSync(dir, { recursive: true, force: true })
  })
})
```

- [ ] **Step 2: Run, confirm fail:** `cd app && npx vitest run test/engine-token.test.ts`

- [ ] **Step 3: Implement `app/electron/engine-token.ts`**

```typescript
import { randomBytes } from 'crypto'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'

// A stable token persisted in userData so the browser extension's saved token
// keeps working across app restarts.
export const loadOrCreateToken = (userDataDir: string): string => {
  const file = join(userDataDir, 'engine-token')
  if (existsSync(file)) return readFileSync(file, 'utf8').trim()
  mkdirSync(userDataDir, { recursive: true })
  const token = randomBytes(32).toString('hex')
  writeFileSync(file, token, 'utf8')
  return token
}
```

- [ ] **Step 4: Run, confirm pass.**

- [ ] **Step 5: Commit**

```bash
git add app/electron/engine-token.ts app/test/engine-token.test.ts
git commit -m "feat: persisted engine token"
```

---

## Task 2: Electron main — start engine + window

**Files:** Create `app/electron/main.ts`, `app/electron/preload.ts`

- [ ] **Step 1: Create `app/electron/main.ts`**

```typescript
import { app, BrowserWindow } from 'electron'
import { join } from 'path'
import { openDb } from '../src/db.js'
import { buildServer } from '../src/server.js'
import { makeGenerate } from '../src/generator.js'
import { AI } from '../src/constants.js'
import { loadOrCreateToken } from './engine-token.js'

const PORT = 7645

const startEngine = (token: string): void => {
  const dbPath = join(app.getPath('userData'), 'canvas.db')
  const db = openDb(dbPath)
  const server = buildServer(db, makeGenerate(AI), token)
  server.listen(PORT, '127.0.0.1', () => console.log(`engine on http://127.0.0.1:${PORT}`))
}

const createWindow = (token: string): void => {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: join(__dirname, '../preload/preload.js'),
      additionalArguments: [`--engine-token=${token}`, `--engine-port=${PORT}`]
    }
  })
  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  const token = loadOrCreateToken(app.getPath('userData'))
  startEngine(token)
  createWindow(token)
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(token)
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
```

- [ ] **Step 2: Create `app/electron/preload.ts`**

```typescript
import { contextBridge } from 'electron'

// Expose the engine base URL + token to the renderer. Read from the args main
// injected, so no secret is hard-coded in renderer code.
const arg = (name: string): string => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.split('=')[1] : ''
}

contextBridge.exposeInMainWorld('engine', {
  baseUrl: `http://127.0.0.1:${arg('engine-port') || '7645'}`,
  token: arg('engine-token')
})
```

- [ ] **Step 3: Typecheck**

Run: `cd app && npx tsc --noEmit`
Expected: exit 0. (Add `"electron"` types via the electron package; if `__dirname`/`process` types error, ensure `@types/node` is present — it is.)

- [ ] **Step 4: Commit**

```bash
git add app/electron/main.ts app/electron/preload.ts
git commit -m "feat: electron main starts engine + window, preload exposes engine config"
```

---

## Task 3: Renderer — ApiClient

**Files:** Create `app/renderer/api-client.ts`; Test `app/test/api-client.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// app/test/api-client.test.ts
import { describe, it, expect } from 'vitest'
import { makeApiClient } from '../renderer/api-client.js'

describe('makeApiClient', () => {
  it('sends the token and parses JSON for GET', async () => {
    const calls: { url: string; headers: Record<string, string> }[] = []
    const fakeFetch = (async (url: string, init: { headers: Record<string, string> }) => {
      calls.push({ url, headers: init.headers })
      return { ok: true, json: async () => [{ id: 1 }] }
    }) as unknown as typeof fetch
    const api = makeApiClient({ baseUrl: 'http://x', token: 'T' }, fakeFetch)
    const rows = await api.request('/capture')
    expect(calls[0].url).toBe('http://x/capture')
    expect(calls[0].headers.authorization).toBe('Bearer T')
    expect(rows).toEqual([{ id: 1 }])
  })

  it('throws on non-ok', async () => {
    const fakeFetch = (async () => ({ ok: false, status: 500 })) as unknown as typeof fetch
    const api = makeApiClient({ baseUrl: 'http://x', token: 'T' }, fakeFetch)
    await expect(api.request('/capture')).rejects.toThrow()
  })
})
```

- [ ] **Step 2: Run, confirm fail:** `cd app && npx vitest run test/api-client.test.ts`

- [ ] **Step 3: Implement `app/renderer/api-client.ts`**

```typescript
interface EngineConfig {
  baseUrl: string
  token: string
}

// Single wrapper for all engine calls (never call fetch directly in components).
export const makeApiClient = (cfg: EngineConfig, fetchImpl: typeof fetch = fetch) => {
  const request = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
    const res = await fetchImpl(cfg.baseUrl + path, {
      ...init,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${cfg.token}`,
        ...(init.headers || {})
      }
    })
    if (!res.ok) throw new Error(`engine ${res.status}`)
    return res.json() as Promise<T>
  }
  return { request }
}
```

- [ ] **Step 4: Run, confirm pass.**

- [ ] **Step 5: Commit**

```bash
git add app/renderer/api-client.ts app/test/api-client.test.ts
git commit -m "feat: renderer ApiClient wrapper"
```

---

## Task 4: Renderer — React shell (search / ask / captures)

**Files:** Create `app/renderer/index.html`, `app/renderer/main.tsx`, `app/renderer/store.ts`, `app/renderer/app.tsx`

No unit tests (UI wiring, verified by running the app). Keep components small; MUI `sx` only.

- [ ] **Step 1: `app/renderer/index.html`**

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Canvas Notes</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2: `app/renderer/store.ts`** (zustand client state)

```typescript
import { create } from 'zustand'

interface UiState {
  query: string
  mode: 'hybrid' | 'keyword' | 'semantic'
  setQuery: (query: string) => void
  setMode: (mode: UiState['mode']) => void
}

export const useUi = create<UiState>((set) => ({
  query: '',
  mode: 'hybrid',
  setQuery: (query) => set({ query }),
  setMode: (mode) => set({ mode })
}))
```

- [ ] **Step 3: `app/renderer/main.tsx`** (root: QueryClient + MUI theme + the exposed engine config)

```typescript
import React from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CssBaseline, ThemeProvider, createTheme } from '@mui/material'
import { makeApiClient } from './api-client.js'
import { App } from './app.js'

declare global {
  interface Window {
    engine: { baseUrl: string; token: string }
  }
}

export const api = makeApiClient(window.engine)
const queryClient = new QueryClient()
const theme = createTheme({ palette: { mode: 'dark' } })

createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <App />
      </ThemeProvider>
    </QueryClientProvider>
  </React.StrictMode>
)
```

- [ ] **Step 4: `app/renderer/app.tsx`** (shell: prominent search, results, ask, captures, and the token for extension setup)

```typescript
import React, { useState } from 'react'
import { Box, TextField, Typography, Card, CardContent, Button, Stack, Chip } from '@mui/material'
import { useQuery } from '@tanstack/react-query'
import { useUi } from './store.js'
import { api } from './main.js'

interface Capture {
  id: number
  content: string
  note: string
  source: { url?: string; anchor?: string }
}
interface SearchHit {
  capture: Capture
  score: number
}
interface AskResult {
  answer: string
  citations: Capture[]
}

export const App = (): React.ReactElement => {
  const { query, setQuery, mode } = useUi()
  const [asked, setAsked] = useState<AskResult | null>(null)

  const results = useQuery({
    queryKey: ['search', query, mode],
    queryFn: () => api.request<SearchHit[]>(`/search?q=${encodeURIComponent(query)}&mode=${mode}`),
    enabled: query.trim().length > 0
  })

  const ask = async (): Promise<void> => {
    const r = await api.request<AskResult>('/ask', {
      method: 'POST',
      body: JSON.stringify({ question: query })
    })
    setAsked(r)
  }

  return (
    <Box sx={{ maxWidth: 900, mx: 'auto', p: 3 }}>
      <Typography variant="h5" sx={{ mb: 2 }}>Canvas Notes</Typography>
      <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
        <TextField
          fullWidth
          placeholder="Search your sources or ask a question…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <Button variant="contained" onClick={ask} disabled={!query.trim()}>Ask</Button>
      </Stack>

      {asked && (
        <Card sx={{ mb: 2, bgcolor: 'rgba(120,140,255,.08)' }}>
          <CardContent>
            <Typography variant="subtitle2" sx={{ opacity: 0.7 }}>Answer</Typography>
            <Typography sx={{ whiteSpace: 'pre-wrap' }}>{asked.answer}</Typography>
            <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: 'wrap' }}>
              {asked.citations.map((c) => (
                <Chip key={c.id} size="small" label={c.source.url || `#${c.id}`} />
              ))}
            </Stack>
          </CardContent>
        </Card>
      )}

      {(results.data || []).map((hit) => (
        <Card key={hit.capture.id} sx={{ mb: 1 }}>
          <CardContent>
            <Typography>{hit.capture.content}</Typography>
            {hit.capture.note && (
              <Typography variant="body2" sx={{ mt: 0.5, color: 'primary.light' }}>
                {hit.capture.note}
              </Typography>
            )}
            {hit.capture.source.url && (
              <Typography
                variant="caption"
                component="a"
                href={`${hit.capture.source.url}${hit.capture.source.anchor || ''}`}
                sx={{ color: 'text.secondary', display: 'block', mt: 0.5 }}
              >
                jump to source
              </Typography>
            )}
          </CardContent>
        </Card>
      ))}

      <Typography variant="caption" sx={{ display: 'block', mt: 3, opacity: 0.5 }}>
        Extension token: {window.engine.token} · endpoint {window.engine.baseUrl}
      </Typography>
    </Box>
  )
}
```

- [ ] **Step 5: Typecheck + commit**

```bash
cd app && npx tsc --noEmit
git add app/renderer
git commit -m "feat: react shell — search, ask, captures, token display"
```

---

## Task 5: Run + manual verification

- [ ] **Step 1: Rebuild for Electron, then launch the app** (Node 24)

Run: `cd app && npm run rebuild:electron && npm run dev`
Expected: `electron-rebuild` recompiles `better-sqlite3` for Electron's ABI, then an Electron window opens showing "Canvas Notes"; the console logs `engine on http://127.0.0.1:7645`. (To run the test suite again afterward, first `npm run rebuild:node`.)

- [ ] **Step 2: Verify corpus flows in the window**
  - The footer shows the extension token + endpoint.
  - If you have captures, type a word → results appear; click "Ask" → an answer with citations (requires Ollama running or a Claude key configured via env; otherwise Ask errors — that's expected).

- [ ] **Step 3: Verify the extension still works against the app's engine**
  - Copy the token shown in the app footer into the extension Options (Engine URL `http://127.0.0.1:7645`, that token).
  - Capture on a page → confirm it appears when you search in the app window.

- [ ] **Step 4: Confirm no Node-version dance**
  - The packaged path uses Electron's bundled Node + the rebuilt `better-sqlite3`, so end users won't need nvm. (Dev still uses Node 24 for `vitest`/`tsc`.)

- [ ] **Step 5: Back to Node-ABI, run full suite + typecheck, commit any fixes**

```bash
cd app && npm run rebuild:node && npx vitest run && npx tsc --noEmit
git add -A && git commit -m "test: phase 2a shell green" # if needed
```

---

## Self-review notes / next plans

- **Spec coverage (2a):** app-you-open shell ✅; search-first UI ✅; ask with citations ✅; jump-to-source link ✅; engine embedded in Electron with persisted token so the extension keeps working ✅; native rebuild removes end-user Node requirement ✅.
- **Deferred to 2b:** canvases table + living-document store (ProseMirror JSON + provenance/citations) + collation/merge engine (retrieve → synthesize → merge preserving locked spans) — headless + tested.
- **Deferred to 2c:** the canvas UI (TipTap editor with provenance tints + inline citations + Refresh + span popover), canvas list in a left rail.
- **Deferred to Phase 3:** packaging (electron-builder), auto-update, screen-region OCR capture.
- **Risk:** `@electron/rebuild` must run whenever Electron's version changes; the `postinstall` handles the common case. If a prebuilt `better-sqlite3` for the Electron version exists, it's used automatically.
```
