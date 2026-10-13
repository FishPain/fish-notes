# Screen-capture source detection + confirm dialog

## Problem

A screen-region capture stores only the OCR'd text and the PNG — `source: { type: 'screen' }`
with no URL or app context. When the screenshot is of a web page, the page's URL is lost,
so captures can't link back to where they came from.

## Goal

On capture, best-effort detect the source app (and, for browsers, the active-tab URL), then
show a quick confirm/edit dialog pre-filled with what was detected plus an optional
description, before the capture is stored.

## Non-goals

- Windows/Linux source detection (macOS only; `screencapture` is already macOS-only).
- Per-element/anchor detection within a page (only the top-level URL).
- Silent/background capture — every capture now goes through the confirm dialog.

## Flow

1. **Detect (electron main)** — in `captureRegion()`, *before* launching `screencapture -i`,
   run one `osascript` to read the frontmost app name, and if it is a known browser, its
   active-tab URL + title. Detection must happen first because `screencapture` becomes the
   frontmost process once launched.
2. **Return** `{ pngBase64, appName?, windowTitle?, url?, cancelled?, error? }` from the IPC
   handler (today it returns only `pngBase64`/`cancelled`/`error`).
3. **Confirm dialog (renderer)** — `captureScreen()` stores the shot as a *pending capture* in
   the UI store instead of posting immediately. A React dialog shows the screenshot thumbnail,
   a pre-filled **URL** field, a pre-filled **Source / app** field, and an empty
   **Description** field. **Save** posts; **Cancel** discards the pending capture.
4. **Store (server)** — `POST /capture/screen` is widened to accept optional `url`, `appName`,
   `windowTitle`, `note`. It still OCRs the PNG, then inserts the capture with the confirmed
   source + description.

## Detection details

- Frontmost app: `tell application "System Events" to get name of first process whose frontmost is true`.
- Chromium family (Google Chrome, Brave Browser, Microsoft Edge, Vivaldi) share one dictionary:
  `tell application "<app>" to get {URL, title} of active tab of front window`.
- Safari: `tell application "Safari" to get {URL, name} of front document`.
- Any `osascript` failure (not a browser, permission denied, no window) → URL/title left
  `undefined`. No hard error; the dialog just shows empty fields.
- First browser-URL read triggers a macOS **Automation** (AppleEvents) TCC prompt, and the
  System Events read triggers an Automation prompt for System Events. If denied, detection
  degrades to empty fields.
- The in-app "Capture screen" button detects Fish Notes itself as frontmost (empty URL); that
  path relies on the user typing the source. The global hotkey is the auto-detect path.

## Data model

No schema change — `CaptureSource` already has `url`, `appName`, `windowTitle`; `CaptureInput`
already has `note`. The server sets:

- `source = { type: 'screen', url?, appName?, windowTitle? }` (omit empty fields)
- `note = description`
- `contextText = [description, windowTitle].filter(Boolean).join(' — ')` so the description and
  page title are embedded + FTS-indexed with the OCR'd content (mirrors the upload flow's title
  handling).

## Display

No new display code: the capture card already renders `note` as a sub-line, `source.url` as a
"jump to source" link, and the screenshot inline.

## Files touched

- `app/electron/main.ts` — `captureRegion()`: osascript detection before `screencapture`.
- `app/electron/preload.ts` — no change (resolve value passes through `capture.region`).
- `app/renderer/store.ts` — `captureScreen()` sets a pending capture; new `confirmCapture` /
  `cancelCapture` actions; posts with source + note.
- `app/renderer/` — new confirm-dialog component (MUI), mounted once near the app root.
- `app/src/routes/capture/capture.controller.ts` — widen `ScreenSchema`; build source + note +
  contextText.

## Testing

- Server: extend/author a capture-controller test asserting that posted `url`/`appName`/
  `windowTitle`/`note` land on the stored capture and in `contextText`.
- Detection osascript is side-effectful/permission-gated — not unit-tested; verified manually.

## Edge cases

- Permission denied / non-browser / no front window → empty detected fields, dialog still works.
- Cancel in the dialog → pending capture discarded, no OCR, no store.
- Empty OCR text still returns 400 (existing behavior); missing credentials still 401 (existing).
