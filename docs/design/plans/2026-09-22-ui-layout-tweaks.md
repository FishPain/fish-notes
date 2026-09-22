# UI layout tweaks — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Tidy component positioning — regroup the sidebar (add-note moves into the Notes header, remove the big bottom button + gap), left-align the note column, and show the /llm hint only on an empty note.

**Architecture:** Renderer-only changes in two components plus one small callback prop on `NoteEditor`. No engine/DB/dep changes. Verified via `tsc --noEmit`, `build:app`, and manual checks (no renderer unit-test harness exists).

**Tech Stack:** React + MUI + TipTap. Run everything under Node 24 (`nvm use 24`).

---

### Task 1: `NoteEditor` reports empty state

**Files:**
- Modify: `app/renderer/note-editor.tsx`

- [ ] **Step 1: Add the optional prop to the props type**

In the `React.forwardRef<NoteEditorHandle, {...}>` prop type, add `onEmptyChange`:

```tsx
{ doc: unknown; onChange: (doc: unknown) => void; onCommand: (prompt: string, context: string) => Promise<string>; onEmptyChange?: (empty: boolean) => void }
```

Destructure it: `({ doc, onChange, onCommand, onEmptyChange }, ref) => {`

- [ ] **Step 2: Fire it from the editor lifecycle**

In the `useEditor({...})` config, add an `onCreate` and augment `onUpdate` to report `editor.isEmpty`:

```tsx
onCreate: ({ editor }) => onEmptyChange?.(editor.isEmpty),
onUpdate: ({ editor }) => {
  onEmptyChange?.(editor.isEmpty)
  if (saveTimer.current) clearTimeout(saveTimer.current)
  saveTimer.current = setTimeout(() => onChange(editor.getJSON()), 800)
},
```

- [ ] **Step 3: Verify types**

Run: `cd app && npx tsc --noEmit`
Expected: clean (no output).

- [ ] **Step 4: Commit**

```bash
git add app/renderer/note-editor.tsx
git commit -m "feat(editor): report empty state via onEmptyChange"
```

---

### Task 2: Note view — left-align column + conditional /llm hint

**Files:**
- Modify: `app/renderer/canvas-view.tsx`

- [ ] **Step 1: Track empty state**

Add near the other `useState` hooks in `CanvasView`:

```tsx
const [empty, setEmpty] = useState(true)
```

- [ ] **Step 2: Left-align the column**

Change the inner column `Box` from centered to left-aligned:

```tsx
<Box sx={{ maxWidth: 720 }}>
```
(remove `mx: 'auto'`; the outer `<Box sx={{ ... px: 4, py: 5 }}>` provides the left gutter.)

- [ ] **Step 3: Show the hint only when empty**

Wrap the existing hint `Typography` so it renders only when `empty`:

```tsx
{empty && (
  <Typography variant="caption" sx={{ opacity: 0.45, display: 'block', mb: 3 }}>
    Type <b>/llm</b> then your instruction to have AI write here from your sources.
  </Typography>
)}
```

- [ ] **Step 4: Wire the editor callback**

Pass `onEmptyChange` to `<NoteEditor>`:

```tsx
<NoteEditor key={canvasId} ref={editorRef} doc={canvas.data.doc} onChange={(d) => save.mutate(d)} onCommand={runComplete} onEmptyChange={setEmpty} />
```

- [ ] **Step 5: Verify types + build**

Run: `cd app && npx tsc --noEmit && npm run build:app`
Expected: tsc clean; build succeeds.

- [ ] **Step 6: Commit**

```bash
git add app/renderer/canvas-view.tsx
git commit -m "ux(note): left-align column; show /llm hint only on an empty note"
```

---

### Task 3: Sidebar regroup (`canvas-list.tsx`)

**Files:**
- Modify: `app/renderer/canvas-list.tsx`

- [ ] **Step 1: Import Divider**

Add `Divider` to the `@mui/material` import list.

- [ ] **Step 2: Add a divider after the nav block**

After the `Chat` `ListItemButton` (and before the `Notes` overline), insert:

```tsx
<Divider sx={{ my: 1 }} />
```

- [ ] **Step 3: NOTES header with an inline + (opens the popover)**

Replace the standalone `<Typography variant="overline" …>Notes</Typography>` with a header row containing the `+`:

```tsx
<Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ pl: 1, pr: 0.5 }}>
  <Typography variant="overline" sx={{ opacity: 0.5 }}>Notes</Typography>
  <IconButton size="small" aria-label="new note" onClick={(e) => setAnchor(e.currentTarget)}>
    <FontAwesomeIcon icon={faPlus} style={{ fontSize: 13 }} />
  </IconButton>
</Stack>
```

- [ ] **Step 4: Remove the big "New note" button**

Delete the full-width `<Button … startIcon={faPlus} …>New note</Button>` block that sat above the `Popover`. (The `Popover` stays; it's now anchored by the header `+`.)

- [ ] **Step 5: Footer divider before Settings**

Immediately before the `Settings` `ListItemButton`, add:

```tsx
<Divider sx={{ mt: 1, mb: 0.5 }} />
```
(The notes `List` keeps `sx={{ flex: 1 }}`, so Settings stays pinned to the bottom.)

- [ ] **Step 6: Verify types + build**

Run: `cd app && npx tsc --noEmit && npm run build:app`
Expected: tsc clean; build succeeds.

- [ ] **Step 7: Commit**

```bash
git add app/renderer/canvas-list.tsx
git commit -m "ux(sidebar): move New note to Notes header, group nav with dividers, quiet Settings footer"
```

---

## Manual verification (after all tasks)

Run `nvm use 24 && npm run dev`:
- Sidebar: `Sources`, `Chat`, divider, a **Notes** header with a working **+** that opens the create popover, the notes list, a divider, then **Settings** at the bottom. No big amber button, no empty gap.
- Open a note with content: text hugs the left at ~720px; the /llm hint is hidden.
- Open/create an empty note: the /llm hint shows; it disappears as soon as you type.

## Self-review

- **Spec coverage:** sidebar regroup (Task 3), left-align column (Task 2), empty-only hint (Tasks 1+2), no new deps/engine changes — all covered.
- **Placeholders:** none; every code step shows exact code.
- **Type consistency:** `onEmptyChange?: (empty: boolean) => void` defined in Task 1, consumed in Task 2; `setEmpty`/`empty` consistent; `faPlus` already imported in `canvas-list.tsx`.
