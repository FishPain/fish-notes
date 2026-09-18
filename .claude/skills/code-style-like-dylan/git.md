# Git — commit voice & workflow

Commit/git conventions from ~1450 of the developer's real commits.

## Commit messages

- **NOT Conventional Commits.** Prefixes (`feat:`/`fix:`/`chore:`) appear in <0.5% of commits, accidentally.
  Do **not** impose them.
- Subjects are **free-form, sentence-case, imperative-leaning** (tense not enforced — `Add`/`Added` both
  appear). Short (2–8 words), **subject-only** (almost never a body), no emoji, no issue refs.
- Dominant verbs: `Update` (esp. `Update deps` / `Up ver`), `Fix`/`Fixed`, `Add`/`Added`, `Refactor`,
  `Remove`, `Clean up`.
- **Candor is a signature.** Frank, self-deprecating, often profane one-liners are normal and expected:
  `Fix time eval data fuckery`, `Prevent load more button from eating data for breakfast`,
  `Fuck the scrollbar gutter. Overflow-y is better`, `Why the fuck is this mispelled`,
  `Restructure boot process to make it less disgusting`.
- **Honest WIP admissions:** `(dirty, untested)`, `Drive Evaluation system (Untested)`, `Implement X (partial)`,
  `Stuff`, `One huge ass chunk`, `Dump incomplete`.
- Reverts use the default `Revert "..."` subject.

**How to apply:** write a short plain-English imperative subject describing the change; skip the `type:`
prefix; don't sanitize the voice into corporate blandness, but don't manufacture profanity either — match
the register of the surrounding history. Still honour any required trailer (e.g. `Co-Authored-By`).

## Branches / workflow / versioning

- Branches: kebab-case with loose prefixes — `chore/…` (most common), `feat/…`, older `feature/…`, and the
  occasional bare descriptive name (`native-rewrite`, `v4-emergency-fixes`).
- **Merge-based, not rebase.** Feature work lands via GitHub PRs; expect `Merge pull request #N` and
  `Merge branch 'main'` commits.
- **Semver `vMAJOR.MINOR.PATCH` tags on release-facing/versioned packages**; internal services bump versions
  via commit subjects (`Up ver`) rather than tags.
- Default branch `main` (older repos may still be `master`).
