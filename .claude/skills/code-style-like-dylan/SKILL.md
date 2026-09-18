---
name: code-style-like-dylan
description: Use when writing, reviewing, or scaffolding code (TypeScript, React, Node/Express, Mongoose, or C#) and it should match this developer's established conventions — naming, file/folder structure, exports, types, error handling, data layer, UI patterns, and commit style. Applies across any project, not one specific repo.
---

# Coding style

How this developer writes code, distilled from their real codebases so new code reads as *theirs*, not
foreign. **Default to matching the file you're editing**; where a file has no precedent, these are the
go-forward conventions.

Depth lives in sibling reference files — read the relevant one for the task:
- **structure.md** — folders, file naming, import order, exports, variable naming, `constants.ts`
- **react.md** — component/hook layout, forms, state, MUI styling, TanStack Query
- **data.md** — Mongoose schemas/TTL, queries, yup, the `HttpError`/`Reason` error contract
- **git.md** — commit voice & git workflow
- **examples.md** — ten canonical exemplars to pattern-match against

## Defaults for a new project

- **Package manager: npm.** Backend: **Node + Express 5 + Mongoose**. **No automated tests** unless asked.
- **Spelling split by layer:** US spelling in code identifiers (`normalize`, `color`); British spelling in
  English user-facing copy (`authorise`, `colour`). Comments/JSDoc are always English.
- **Copy language follows the audience.** Detect it from the project — existing UI copy, an `i18n`/locale
  config, or an explicit steer. In an existing codebase, match the copy language already there. When
  greenfield or unknown, default to English and confirm before assuming Japanese.

## Universal idioms

- **Arrow-const everything:** `export const name = (args) => {...}`. The `function` keyword is reserved for
  React route layouts (`export default function XLayout()`) and a little framework glue. Never `React.FC`,
  never class-based controllers/decorators.
- **Named exports by default.** `export default` only for Mongoose models, React layouts/pages, and the odd
  singleton. **No barrel / `index.ts` re-export files.** Express routers end with `export { router as xController };`.
- **Naming:** `camelCase` funcs/vars; `PascalCase` types/interfaces/components/yup-schema consts;
  `UPPER_SNAKE` config objects and their keys; kebab-case files (hooks/utils/middleware), PascalCase files
  (components/pages/layouts, `*.cs`). `is*`/`has*` booleans; `handleX` (DOM) vs `onX` (callback); `_`-prefix
  unused params.
- **Types:** `interface` for object shapes, `type` for unions/aliases/mapped. Closed sets → string-union
  literals; a real `enum` only for the error-`Reason` convention. `unknown` + guard/cast, **never `any`**
  (the one permitted `any` carries an inline eslint-disable). `!` and `?.`/`??` are first-class.
- **Control flow:** guard-clause / early-return (`if (!x) return;`). `const` by default, `let` only when
  reassigned. Heavy destructuring of params/payloads. **async/await only — no `.then()` chains.**
- **Errors (backend):** emitted, not thrown — `throwHttpError(httpErrors.<name>, Reason.<X> | null, res)`
  then a bare `return;`. Socket handlers never throw — `return callback(errorResponseData('CODE', msg))`.
- **Comments:** self-documenting code; reserve comments for genuine WHY / footguns, not narration. Delete
  dead code rather than leaving it commented.
- **Config & strings:** single quotes + template literals; `constants.ts` is the single config surface
  (never read `process.env` elsewhere). Prettier: single quotes, **semicolons**, no trailing commas,
  2-space — except an Electron/desktop dialect that drops semicolons.

## Library defaults ("when you need X, use Y")

| Need | Backend | UI / React |
|---|---|---|
| Validation | **yup** | yup + **formik** |
| Data | Mongoose fluent + `.lean()` | **TanStack Query** over an `ApiClient.request()` wrapper (never raw axios) |
| State | — | **zustand** (client) + TanStack Query (server) + Context (narrow subtrees) |
| Styling | — | **MUI `sx`** only — no styled/emotion/Tailwind/`className` |
| Animation / Icons | — | **framer-motion** / **FontAwesome** |
| Dates | `ms()` for durations | **luxon** |
| Numbers | **lodash** / `stats-lite` | lodash |
| Logging | bare **`console.*`** (no winston/pino) | — |

## Anti-patterns (would look foreign)

- `function`-declaration or `React.FC` components/controllers; class-based controllers/decorators.
- `export default` for a non-model backend module; any barrel/`index.ts` re-export file.
- Throwing HttpErrors out of a handler; hand-rolling `res.status().json(error)` (except the 404 fallback);
  throwing out of a socket handler.
- Bare `any`; `interface` for unions or `type` for plain object shapes; TS `enum` for arbitrary closed sets.
- Raw `axios`/`fetch` in components; `useQueryClient()` for invalidation (use the `reactQueryClient` singleton).
- `styled()`/emotion/CSS-modules/Tailwind styling; a logging library; `process.env` read outside `constants.ts`.
- British spelling in identifiers, or US spelling in English user-facing copy; `.then()` chains for control flow.

## C# idioms

**Newtonsoft only** (never `System.Text.Json`). Public fields on DTOs, not auto-properties. PascalCase
method names. Nested `enum` with integer values. Externalize copy to `Strings.resx`/`.ja.resx`. No custom
exception hierarchies; no `async`/`Task` in a hot/live module; file-scoped namespaces, 4-space indent.
