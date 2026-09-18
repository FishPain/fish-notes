# Structure — folders, file naming, imports, exports, naming

Structural fingerprint from the developer's real Node/Express backend code.

## Folder structure (per backend service, under `src/`)

Consistent skeleton plus per-app domain folders:
- **Always present:** `middleware/`, `types/`, `utils/`, and top-level `constants.ts`, `index.ts`,
  `server.ts`. Folder names **kebab-case**.
- **REST services** add `models/` and `routes/`, routes subdivided by feature (`routes/account/`,
  `routes/<feature>/`, each holding its `*.controller.ts`).
- **Domain folders** added as needed (e.g. `events/` for socket handlers, an in-memory store module, a
  background-job module); a lightweight proxy/gateway service may have no `models/` at all.
- `routes.ts` at the root aggregates routers. **No barrel / `index.ts` re-export files.**
- Server middleware order: morgan → jsonHeader → helmet/x-powered-by off → json/urlencoded parsers →
  cookie parser → body transform/sanitize → trust proxy → CORS → session → passport → user sync →
  user-agent detect → custom → **routes → error handler (last)**.

## File naming

Kebab-case with dotted role suffixes: `*.controller.ts` (routers), `*.collection.ts` (Mongoose models),
`*.service.ts` (explicit service layer when logic warrants), `*.eval.ts` (heavy computation/scoring),
`*.event.ts` (socket handlers). Components/pages/layouts and `*.cs` are PascalCase. Mongoose collection
**names** are snake_case (`drive_record`, `product_keys`) even though the model variable is camelCase.

## Import ordering (strict, 3 groups, blank-line separated)

```ts
import { randomBytes } from 'crypto';   // 1. node builtins
import { readFileSync } from 'fs';

import { Router } from 'express';        // 2. third-party
import { object, string } from 'yup';

import { httpErrors, Reason, throwHttpError } from '../../utils/http-errors.js';  // 3. local relative
import userCollection from '../../models/user.collection.js';
```

- Roughly alphabetical within each group.
- **No `import type { X }`** — type-only import syntax is not used.
- **No path aliases** — all local imports relative.
- Extensions: `.js` is the norm (NodeNext/ESM). Some files mix extensionless + `.js` — don't "fix" a mix
  that compiles fine; match the file you're editing.

## Export patterns

- Arrow-const + **named** export is the default; routers end with `export { router as accountController };`.
- **`export default`** only for Mongoose models (`export default model('users', UserSchema)`), React
  layouts/pages, and the occasional singleton.
- A dedicated service layer may use **`export async function`** (thin controller → fat service). Elsewhere
  everything is arrow-const.
- Routes aggregator:
  ```ts
  export const routes = (app: Application) => {
    const api = Router();
    api.use('/resource', requireAuth, resourceController);
    app.use('/', api);
    app.use(indexController);
  };
  ```

## Variable / function naming micro-idioms

- `camelCase` funcs/vars; `UPPER_SNAKE` config objects (`WEBSERVER`, `SESSION`, `DB`, `API`, `EMAIL`) and
  keys; `is*`/`has*` booleans.
- **Heavy request destructuring** with inline casts, not full validation at destructure:
  `const { complete = true } = req.query as { complete?: string };`
- Liberal non-null assertions in identity/permission code: `req.user!._id!.toString()`.
- Underscore-prefix unused params (`_req`, `_next`). Loop vars meaningful (`code`, `userId`, destructured
  `[key, value]`); single-char only in plain `for (let i...)` counters.
- **Guard-clause density is high:** `if (!x) { throwHttpError(...); return; }` at the top of handlers,
  bare `return;` after every error emit.

## `constants.ts` layout (single config surface)

`dotenv.config()` → `DEBUG_MODE` (nested ternary: `NODE_ENV==='development'` OR `inspector.url()`; some
services use `NODE_ENV` alone) → grouped `UPPER_SNAKE` blocks reading `process.env.X || default`. Required
keys load eagerly with `readFileSync(process.env.PATH!)` (crash-on-missing by design); optional keys use
`process.env.PATH ? readFileSync(...) : null`. CSV env split with `.split(',').map((s) => s.trim())`.
