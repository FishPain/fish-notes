# Fish Notes — browser capturer

A Manifest V3 extension that clips selected text (plus surrounding context, the source
URL, and a `#:~:text=` anchor) into the Fish Notes engine running locally.

## Build

The `content.js` / `background.js` in `extension/` are **build outputs** (git-ignored),
so a fresh clone must build them first:

```bash
cd capturer
npm install
npm run build      # esbuild → extension/content.js + extension/background.js
```

## Load it

1. Open `chrome://extensions` (or your Chromium browser's equivalent).
2. Enable **Developer mode**.
3. **Load unpacked** → select the `capturer/extension/` folder.
4. Open the extension's **Options** and paste the engine token + endpoint. The Fish Notes
   app shows these (engine runs at `http://127.0.0.1:7645`; the token is in the app's
   user-data folder as `engine-token`).

## Use

- Select text on a page → the extension's shortcut (⌘⇧S) or context-menu item sends it to
  the engine, where it's indexed and embedded like any other capture.
- The engine must be running (launch the Fish Notes app).

## Develop

```bash
npm test           # vitest (anchor / dom-context / payload / queue)
npm run typecheck
```
