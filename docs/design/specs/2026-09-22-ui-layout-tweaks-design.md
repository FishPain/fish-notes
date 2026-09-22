# UI layout tweaks — design

Date: 2026-09-22

## Context

The desktop shell has grown (Sources, Chat, Notes, upload, screen capture) and the
layout has drifted: the sidebar's big amber "New note" button floats at the bottom with a
dead gap above it, disconnected from the Notes list; nav items and actions aren't clearly
grouped; and in the note view the text column floats centered with a large right-side gap
while the "Type /llm…" hint is always shown. This tightens component positioning without
adding features, dependencies, or data/engine changes.

Scope is intentionally small — two existing renderer components plus one small callback
prop. No new dependencies, no backend/DB changes.

## Changes

### Sidebar — `app/renderer/canvas-list.tsx`
- **Nav block:** keep `Sources` and `Chat` at the top, followed by a subtle `Divider`.
- **NOTES header row:** the "Notes" overline on the left and a small `+` `IconButton`
  (aria-label "new note") on the right. This `+` becomes the anchor that opens the existing
  New-note `Popover` (move the `setAnchor(e.currentTarget)` handler onto it).
- **Remove** the full-width amber "New note" `Button` and the empty vertical gap it left.
- **Footer:** a `Divider`, then the existing `Settings` row pinned at the bottom (the
  notes `List` keeps `flex: 1` so Settings stays at the bottom).

### Note view — `app/renderer/canvas-view.tsx`
- **Left-align the column:** the inner `Box` changes from `maxWidth: 720, mx: 'auto'` to
  `maxWidth: 720` left-aligned (drop `mx: 'auto'`); the outer `px` padding is the left
  gutter. Comfortable reading width, no floating right gap.
- **Conditional /llm hint:** show the "Type /llm…" helper only when the note is empty.
  Track empty state live from the editor (no polling of the saved doc).

### Editor — `app/renderer/note-editor.tsx`
- Add an optional prop `onEmptyChange?: (empty: boolean) => void`. Call it from the
  `useEditor` `onCreate` and `onUpdate` with `editor.isEmpty`. `canvas-view.tsx` keeps an
  `empty` state (default true), passes `onEmptyChange={setEmpty}`, and renders the hint only
  when `empty`. Uses TipTap's built-in `isEmpty` — no new dependency.

## Non-goals
No changes to Sources/Chat views, routing, the engine, styling theme, or any data. No new
libraries. Not a broader visual redesign — only component positioning + the empty-state hint.

## Verification
- `npx tsc --noEmit` clean; existing tests unaffected (renderer-only, no test harness for UI).
- `npm run build:app` succeeds.
- Manual (`npm run dev`): sidebar shows Sources/Chat, a divider, a "Notes" header with a
  working `+` (opens the create popover), the list, then Settings at the bottom — no big
  amber button, no gap. Open a note: text hugs the left at a readable width; the /llm hint
  is visible on an empty note and disappears once you type; reopening an empty note shows it
  again.
