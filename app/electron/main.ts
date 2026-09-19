import { app, BrowserWindow, shell, ipcMain, systemPreferences } from 'electron'
import { join } from 'path'
import { execFile } from 'node:child_process'
import { readFile, rm } from 'node:fs/promises'
import { openDb } from '../src/db.js'
import { buildServer } from '../src/server.js'
import { makeGenerate } from '../src/generator.js'
import { makeMarkdownGenerator } from '../src/markdown-generator.js'
import { AI } from '../src/constants.js'
import { loadOrCreateToken } from './engine-token.js'

// Electron derives userData from app.getName(), which otherwise falls back to the
// package.json "name" (canvas-notes-engine). Set it so data lives under "Fish Notes".
// Must run before the first app.getPath('userData') call.
app.setName('Fish Notes')

const PORT = 7645

const SCREEN_SETTINGS = 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture'

// Native macOS interactive region screenshot → base64 PNG.
// - { cancelled } if the user presses Esc (no file written)
// - { error: 'permission' } if Screen Recording permission is missing (the classic
//   "could not create image from rect" failure) — we also open the settings pane.
const captureRegion = (): Promise<{ cancelled?: boolean; pngBase64?: string; error?: string }> => {
  const tmp = join(app.getPath('temp'), `fishnotes-${Date.now()}.png`)
  return new Promise((resolve) => {
    execFile('screencapture', ['-i', tmp], async (err) => {
      if (err) {
        console.error('capture-region: screencapture failed', err.message)
        // Attempting the capture registers the app in the Screen Recording list;
        // if it's still not granted, guide the user there.
        const granted = systemPreferences.getMediaAccessStatus('screen') === 'granted'
        if (!granted) {
          shell.openExternal(SCREEN_SETTINGS)
          return resolve({ error: 'permission' })
        }
        return resolve({ cancelled: true })
      }
      try {
        const png = await readFile(tmp)
        await rm(tmp, { force: true })
        console.log(`capture-region: captured ${Math.round(png.length / 1024)}kb`)
        resolve({ pngBase64: png.toString('base64') })
      } catch {
        console.log('capture-region: no file (cancelled)')
        resolve({ cancelled: true }) // no file → user cancelled selection
      }
    })
  })
}

const startEngine = (token: string): void => {
  const dbPath = join(app.getPath('userData'), 'canvas.db')
  console.log('db at', dbPath)
  const db = openDb(dbPath)
  const server = buildServer(db, makeGenerate(AI), token, makeMarkdownGenerator(AI))
  server.listen(PORT, '127.0.0.1', () => console.log(`engine on http://127.0.0.1:${PORT}`))
}

const createWindow = (token: string): void => {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      // electron-vite emits the preload as .mjs (ESM); an ESM preload needs sandbox off.
      preload: join(__dirname, '../preload/preload.mjs'),
      sandbox: false,
      additionalArguments: [`--engine-token=${token}`, `--engine-port=${PORT}`]
    }
  })
  // Open source links in the user's real browser, never inside the app window.
  const appUrl = process.env.ELECTRON_RENDERER_URL || ''
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, url) => {
    if (appUrl && url.startsWith(appUrl)) return // allow in-app / HMR navigation
    if (url.startsWith('http')) {
      e.preventDefault()
      shell.openExternal(url)
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  const token = loadOrCreateToken(app.getPath('userData'))
  ipcMain.handle('capture-region', captureRegion)
  startEngine(token)
  createWindow(token)
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(token)
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
