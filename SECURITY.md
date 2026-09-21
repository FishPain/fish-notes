# Security

## Reporting a vulnerability

Please report security issues privately rather than in public issues — open a GitHub
security advisory on this repository, or contact the maintainer. We'll respond as soon as
we can.

## Notes for users

- **Your API key stays local.** It's entered in the app's Settings and stored in your
  user-data folder (`~/Library/Application Support/Fish Notes/settings.json`), or in a
  local `.env` for development. It is **not** bundled into packaged builds and should never
  be committed — `.env` is git-ignored.
- **The engine binds to `127.0.0.1`** and requires a per-install bearer token, so it isn't
  reachable off your machine.
- If you ever shared a build or `.env` that contained a real key, **rotate that key**.
