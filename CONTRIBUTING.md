# Contributing to Fish Notes

Thanks for your interest! This is a small project — issues and PRs are welcome.

## Repo layout

- `app/` — Electron desktop app + embedded Node engine (its own npm package).
- `capturer/` — MV3 browser extension (its own npm package).
- `docs/` — design notes and build plans.

Each package has its own `package.json`, tests, and TypeScript config.

## Getting set up

See the [root README](./README.md) for prerequisites (Node 24, an OpenAI-compatible
endpoint) and the dev flow. In short:

```bash
cd app && nvm use && npm install && npm run dev
```

## Before opening a PR

Run these in the package(s) you touched:

```bash
npm run typecheck   # tsc --noEmit
npm test            # vitest
npx prettier -c .   # formatting check
```

CI runs typecheck + tests on every push/PR.

## Code style

- Prettier (config in each package's `.prettierrc`): **no semicolons, single quotes, no
  trailing commas, width 100**. Format with your editor's format-on-save or `npx prettier -w .`.
- Keep changes focused; match the surrounding style; add a test for non-trivial logic.

## Reporting security issues

See [SECURITY.md](./SECURITY.md) — please don't file public issues for vulnerabilities.
