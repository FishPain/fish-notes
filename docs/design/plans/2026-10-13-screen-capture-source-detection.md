# Screen-capture Source Detection + Confirm Dialog — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On each screen-region capture, best-effort detect the source app + browser URL, show a pre-filled confirm/edit dialog (URL, source, optional description), and store that context with the capture.

**Architecture:** Detection runs in the Electron main process via `osascript` before `screencapture` launches, and rides back on the IPC result. The renderer holds the shot as a "pending capture" and shows an MUI dialog; on Save it posts the confirmed source + description to a widened `POST /capture/screen`, which still OCRs server-side.

**Tech Stack:** Electron (main + preload), React + MUI + Zustand (renderer), Express + yup + better-sqlite3 (engine), Vitest.

**Spec:** `docs/design/specs/2026-10-13-screen-capture-source-detection.md`

---

## Prerequisites

- Working dir for all commands: `app/`.
- Run the suite once before starting: `npx vitest run`. If tests fail with `ERR_DLOPEN_FAILED` (native addon built for a different runtime), rebuild first: `npm run rebuild` (or `npx electron-rebuild`). Native-addon load is an environment prerequisite, not part of this work.

## File Structure

- `app/src/routes/capture/capture.controller.ts` — **modify**: widen `ScreenSchema`; build `source` + `note` + `contextText` on the `/screen` route.
- `app/test/capture.controller.test.ts` — **create**: server test for the widened `/screen` route (OCR stubbed).
- `app/electron/main.ts` — **modify**: add `detectSource()`; call it at the top of `captureRegion()`; include fields in the resolved payload.
- `app/renderer/main.tsx` — **modify**: extend the `window.capture.region` return type; mount `<CaptureDialog />`.
- `app/renderer/store.ts` — **modify**: add `pendingCapture` state + `confirmCapture` / `cancelCapture`; `captureScreen()` now sets pending instead of posting.
- `app/renderer/capture-dialog.tsx` — **create**: the confirm/edit MUI dialog.

---

## Task 1: Widen `POST /capture/screen` to store source + description

**Files:**
- Modify: `app/src/routes/capture/capture.controller.ts`
- Test: `app/test/capture.controller.test.ts`

- [ ] **Step 1: Write the failing test**

Create `app/test/capture.controller.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { openDb } from '../src/db.js'
import { buildServer } from '../src/server.js'

const TOKEN = 'test-token'
const headers = { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` }

// Stub the proxy OCR call (/chat/completions) to return fixed markdown; delegate
// everything else (local Express server, /embeddings) to the fetch set up in test/setup.ts.
let restoreFetch: () => void
beforeEach(() => {
  const prev = globalThis.fetch
  globalThis.fetch = (async (url: unknown, init?: Parameters<typeof fetch>[1]) => {
    if (String(url).includes('/chat/completions')) {
      return { ok: true, json: async () => ({ choices: [{ message: { content: 'OCR TEXT' } }] }) } as Response
    }
    return prev(url as Parameters<typeof fetch>[0], init)
  }) as typeof fetch
  restoreFetch = () => { globalThis.fetch = prev }
})
afterEach(() => restoreFetch())

const makeServer = () => {
  const db = openDb(':memory:')
  const app = buildServer(db, async () => 'stub', TOKEN, async () => '## Draft')
  return app.listen(0)
}

describe('POST /capture/screen', () => {
  it('stores OCR text with the posted url/appName/windowTitle/note and contextText', async () => {
    const server = makeServer()
    const { port } = server.address() as { port: number }
    const base = `http://localhost:${port}`

    const res = await fetch(`${base}/capture/screen`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        pngBase64: 'QUJD',
        url: 'https://example.com/page',
        appName: 'Google Chrome',
        windowTitle: 'Example Page',
        note: 'why this matters'
      })
    })
    expect(res.status).toBe(201)

    const list = (await (await fetch(`${base}/capture`, { headers })).json()) as Array<{
      content: string; note: string; contextText: string
      source: { type: string; url?: string; appName?: string; windowTitle?: string }
    }>
    const cap = list[0]
    expect(cap.content).toBe('OCR TEXT')
    expect(cap.source).toMatchObject({ type: 'screen', url: 'https://example.com/page', appName: 'Google Chrome', windowTitle: 'Example Page' })
    expect(cap.note).toBe('why this matters')
    expect(cap.contextText).toBe('why this matters — Example Page')

    server.close()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/capture.controller.test.ts`
Expected: FAIL — the stored `source` has only `{ type: 'screen' }`; `note`/`contextText` empty (current route ignores the new fields).

- [ ] **Step 3: Widen the schema and build the source**

In `app/src/routes/capture/capture.controller.ts`, replace the `ScreenSchema` line:

```ts
const ScreenSchema = object({
  pngBase64: string().required(),
  url: string().trim(),
  appName: string().trim(),
  windowTitle: string().trim(),
  note: string().trim()
})
```

Then in the `/screen` route, replace the `insertCapture` call (the block after the empty-text 400 guard) with:

```ts
      const source: CaptureSource = { type: 'screen' }
      if (body.url) source.url = body.url
      if (body.appName) source.appName = body.appName
      if (body.windowTitle) source.windowTitle = body.windowTitle
      // Description + page title ride in contextText so they're embedded + FTS-indexed
      // with the OCR'd content (same trick the upload flow uses for titles).
      const contextText = [body.note, body.windowTitle].filter(Boolean).join(' — ')
      const id = await insertCapture(db, {
        content: text,
        contextText,
        note: body.note || '',
        source,
        screenshot: `data:image/png;base64,${body.pngBase64}`,
        tags: [],
        capturedAt: new Date().toISOString()
      })
      res.status(201).json({ id })
```

(`CaptureSource` is already imported in this file.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/capture.controller.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/routes/capture/capture.controller.ts test/capture.controller.test.ts
git commit -m "feat(capture): store source url/app/title + description on screen captures"
```

---

## Task 2: Detect source app + browser URL in Electron main

**Files:**
- Modify: `app/electron/main.ts`
- Modify: `app/renderer/main.tsx` (return type only)

No automated test — `osascript` is side-effectful and macOS-permission-gated (verified manually in Task 4).

- [ ] **Step 1: Add `detectSource()` above `captureRegion`**

In `app/electron/main.ts`, add (right before `const captureRegion = ...`):

```ts
// Run an AppleScript, returning trimmed stdout, or '' on any error (3s cap).
const osa = (script: string): Promise<string> =>
  new Promise((resolve) => {
    execFile('osascript', ['-e', script], { timeout: 3000 }, (err, stdout) => resolve(err ? '' : stdout.trim()))
  })

// Chromium browsers share one AppleScript dictionary ("active tab of front window").
const CHROMIUM = ['Google Chrome', 'Google Chrome Canary', 'Brave Browser', 'Microsoft Edge', 'Vivaldi']

// Best-effort: the frontmost app, and for a browser its active-tab URL + title.
// Any failure (not a browser, no window, Automation permission denied) → empty fields.
// Must be read BEFORE screencapture launches, which itself becomes the frontmost process.
const detectSource = async (): Promise<{ appName?: string; url?: string; windowTitle?: string }> => {
  const appName = await osa('tell application "System Events" to get name of first process whose frontmost is true')
  if (!appName) return {}
  let raw = ''
  if (CHROMIUM.includes(appName)) {
    raw = await osa(`tell application "${appName}" to get (URL of active tab of front window) & linefeed & (title of active tab of front window)`)
  } else if (appName === 'Safari') {
    raw = await osa('tell application "Safari" to get (URL of front document) & linefeed & (name of front document)')
  }
  const [url, windowTitle] = raw.split('\n')
  return { appName, url: url || undefined, windowTitle: windowTitle || undefined }
}
```

(`execFile` is already imported at the top of `main.ts`.)

- [ ] **Step 2: Call it in `captureRegion` and merge into the result**

Change the `captureRegion` signature to `async` and detect first. Replace the opening of the function:

```ts
const captureRegion = async (): Promise<{ cancelled?: boolean; pngBase64?: string; error?: string; appName?: string; url?: string; windowTitle?: string }> => {
  const detected = await detectSource()
  const tmp = join(app.getPath('temp'), `fishnotes-${Date.now()}.png`)
  return new Promise((resolve) => {
    execFile('screencapture', ['-i', tmp], async (err) => {
```

Then in the success branch, spread `detected` into the resolve:

```ts
        resolve({ pngBase64: png.toString('base64'), ...detected })
```

(Leave the `cancelled` / `error` resolves unchanged — detection only matters when a PNG is produced.)

- [ ] **Step 3: Update the renderer's `window.capture.region` type**

In `app/renderer/main.tsx`, replace the `region:` line inside the `capture: { ... }` block:

```ts
      region: () => Promise<{ cancelled?: boolean; pngBase64?: string; error?: string; appName?: string; url?: string; windowTitle?: string }>
```

- [ ] **Step 4: Typecheck + commit**

```bash
npx tsc --noEmit
git add electron/main.ts renderer/main.tsx
git commit -m "feat(capture): detect frontmost app + browser URL before region capture"
```

---

## Task 3: Pending-capture state + confirm dialog

**Files:**
- Modify: `app/renderer/store.ts`
- Create: `app/renderer/capture-dialog.tsx`
- Modify: `app/renderer/main.tsx` (mount the dialog)

- [ ] **Step 1: Add pending-capture state to the store**

In `app/renderer/store.ts`, add to the `UiState` interface (near `ocrJobs`):

```ts
  pendingCapture: { pngBase64: string; url: string; appName: string; windowTitle: string } | null
```

and to the actions section:

```ts
  confirmCapture: (fields: { url: string; appName: string; windowTitle: string; note: string }) => Promise<void>
  cancelCapture: () => void
```

In the store body, add the initial value:

```ts
  pendingCapture: null,
```

- [ ] **Step 2: `captureScreen` sets pending instead of posting**

Replace the body of `captureScreen` *after* the permission check with:

```ts
    if (shot.cancelled || !shot.pngBase64) return
    set({
      pendingCapture: {
        pngBase64: shot.pngBase64,
        url: shot.url || '',
        appName: shot.appName || '',
        windowTitle: shot.windowTitle || ''
      }
    })
  },
```

(Delete the old `jobSeq` / `api.request('/capture/screen', ...)` / `window.alert` block from `captureScreen` — that logic moves to `confirmCapture`.)

- [ ] **Step 3: Add `confirmCapture` and `cancelCapture`**

Add these actions to the store body (e.g. right after `captureScreen`):

```ts
  // Save the pending capture: OCR + store runs in the background (ocrJobs spinner),
  // so you can capture the next one immediately.
  confirmCapture: async ({ url, appName, windowTitle, note }) => {
    const pending = get().pendingCapture
    if (!pending) return
    set({ pendingCapture: null })
    const id = ++jobSeq
    set((s) => ({ ocrJobs: [...s.ocrJobs, id] }))
    try {
      await api.request('/capture/screen', {
        method: 'POST',
        body: JSON.stringify({ pngBase64: pending.pngBase64, url, appName, windowTitle, note })
      })
    } catch (e) {
      window.alert(
        e instanceof Error && e.message.includes('401')
          ? 'Screen capture needs AI credentials — add your API key in Settings.'
          : 'Could not read text from that screenshot — try a clearer region.'
      )
    } finally {
      set((s) => ({ ocrJobs: s.ocrJobs.filter((x) => x !== id) }))
    }
  },
  cancelCapture: () => set({ pendingCapture: null }),
```

- [ ] **Step 4: Create the confirm dialog**

Create `app/renderer/capture-dialog.tsx`:

```tsx
import React, { useEffect, useState } from 'react'
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField } from '@mui/material'
import { useUi } from './store.js'

// Shown after every screen capture: confirm/correct the detected source and add an
// optional description before the screenshot is OCR'd + stored.
export const CaptureDialog = (): React.ReactElement | null => {
  const pending = useUi((s) => s.pendingCapture)
  const confirmCapture = useUi((s) => s.confirmCapture)
  const cancelCapture = useUi((s) => s.cancelCapture)

  const [url, setUrl] = useState('')
  const [appName, setAppName] = useState('')
  const [windowTitle, setWindowTitle] = useState('')
  const [note, setNote] = useState('')

  // Seed the fields from detection whenever a new capture opens the dialog.
  useEffect(() => {
    if (!pending) return
    setUrl(pending.url)
    setAppName(pending.appName)
    setWindowTitle(pending.windowTitle)
    setNote('')
  }, [pending])

  if (!pending) return null

  const save = (): void => void confirmCapture({ url, appName, windowTitle, note })

  return (
    <Dialog open onClose={cancelCapture} maxWidth="sm" fullWidth>
      <DialogTitle>Save screen capture</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Box
            component="img"
            src={`data:image/png;base64,${pending.pngBase64}`}
            alt="captured region"
            sx={{ display: 'block', maxHeight: 160, maxWidth: '100%', borderRadius: 1, border: 1, borderColor: 'divider' }}
          />
          <TextField label="URL" size="small" fullWidth value={url} onChange={(e) => setUrl(e.target.value)} />
          <TextField label="Source / app" size="small" fullWidth value={appName} onChange={(e) => setAppName(e.target.value)} />
          <TextField label="Window title" size="small" fullWidth value={windowTitle} onChange={(e) => setWindowTitle(e.target.value)} />
          <TextField label="Description (optional)" size="small" fullWidth multiline minRows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={cancelCapture}>Cancel</Button>
        <Button variant="contained" onClick={save}>Save</Button>
      </DialogActions>
    </Dialog>
  )
}
```

- [ ] **Step 5: Mount the dialog**

In `app/renderer/main.tsx`, import it near the other imports:

```ts
import { CaptureDialog } from './capture-dialog.js'
```

and render it alongside `<App />` inside the existing provider tree:

```tsx
          <App />
          <CaptureDialog />
```

- [ ] **Step 6: Typecheck + commit**

```bash
npx tsc --noEmit
git add renderer/store.ts renderer/capture-dialog.tsx renderer/main.tsx
git commit -m "feat(capture): confirm/edit dialog for source + description before saving"
```

---

## Task 4: Manual verification

- [ ] **Step 1: Run the app** — `npm run dev` (or the project's run command).
- [ ] **Step 2: Hotkey capture over a browser** — focus a Chrome/Safari tab, press the capture hotkey, select a region. The dialog should open with the URL + window title pre-filled. (First run triggers a macOS Automation permission prompt — approve it. If denied, fields are empty and the dialog still works.)
- [ ] **Step 3: Save** — add a description, Save. A "Reading text from screenshot…" card appears, then the capture shows the OCR'd text, the description sub-line, and a "jump to source" link to the URL.
- [ ] **Step 4: Cancel** — capture again, press Cancel; no card appears and nothing is stored.
- [ ] **Step 5: In-app button** — use the "Capture screen" button; the dialog opens with Fish Notes/empty detection; type a source and save.
- [ ] **Step 6: Full suite** — `npx vitest run`; the new controller test passes and nothing regressed.

---

## Self-Review

- **Spec coverage:** detection (Task 2), confirm dialog with pre-filled URL/source + description (Task 3), widened `/screen` with contextText (Task 1), display reuse (no code — verified in Task 4 step 3), permission degradation (Task 2 `detectSource` returns `{}`; Task 4 step 2), cancel discards (Task 3 `cancelCapture`; Task 4 step 4), empty-OCR 400 / missing-creds 401 unchanged (Task 1 leaves those guards intact). All covered.
- **Type consistency:** `pendingCapture` shape, `confirmCapture` field names (`url/appName/windowTitle/note`), and the posted body keys match across store, dialog, and the server schema. `region()` return type matches the Electron resolve payload (`appName/url/windowTitle`).
- **Placeholders:** none.
