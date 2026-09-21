import './load-env.js' // must be first: sets app name + loads userData/.env before constants.ts
import { app, BrowserWindow, shell, ipcMain, systemPreferences, globalShortcut, dialog } from 'electron'
import { join } from 'path'
import { execFile } from 'node:child_process'
import { readFile, writeFile, rm } from 'node:fs/promises'
import { openDb } from '../src/db.js'
import { buildServer } from '../src/server.js'
import { makeGenerate } from '../src/ai/generator.js'
import { makeMarkdownGenerator } from '../src/ai/markdown-generator.js'
import { AI, PROXY } from '../src/constants.js'
import { loadOrCreateToken } from './engine-token.js'
import { writeSettings } from './settings.js'

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

const SHORTCUT = 'CommandOrControl+Shift+9'
let mainWindow: BrowserWindow | null = null

// Save a data-URL PNG to a user-chosen path and reveal it in Finder. Screenshots
// live as base64 in the DB (no per-file location), so "export" writes one out.
const saveImage = async (dataUrl: string, name: string): Promise<{ saved?: boolean; path?: string; cancelled?: boolean }> => {
  const res = await dialog.showSaveDialog({ defaultPath: name || 'capture.png', filters: [{ name: 'PNG', extensions: ['png'] }] })
  if (res.canceled || !res.filePath) return { cancelled: true }
  const base64 = String(dataUrl).replace(/^data:image\/\w+;base64,/, '')
  await writeFile(res.filePath, Buffer.from(base64, 'base64'))
  shell.showItemInFolder(res.filePath)
  return { saved: true, path: res.filePath }
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
  mainWindow = win
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
  ipcMain.handle('save-image', (_e, { dataUrl, name }: { dataUrl: string; name: string }) => saveImage(dataUrl, name))

  // Settings: read effective config (defaults + env + saved), write overrides to
  // userData/settings.json, test the proxy, and relaunch to apply.
  ipcMain.handle('settings:get', () => ({
    baseUrl: PROXY.baseUrl,
    apiKey: PROXY.apiKey ?? '',
    chatModel: AI.model,
    ocrModel: AI.ocrModel
  }))
  ipcMain.handle('settings:save', (_e, cfg: { baseUrl?: string; apiKey?: string; chatModel?: string; ocrModel?: string }) => {
    const map: Record<string, string> = {}
    if (cfg.baseUrl !== undefined) map.OPENAI_BASE_URL = cfg.baseUrl
    if (cfg.apiKey !== undefined) map.OPENAI_API_KEY = cfg.apiKey
    if (cfg.chatModel !== undefined) map.CANVAS_AI_MODEL = cfg.chatModel
    if (cfg.ocrModel !== undefined) map.CANVAS_OCR_MODEL = cfg.ocrModel
    writeSettings(map)
  })
  ipcMain.handle('settings:test', async (_e, { baseUrl, apiKey }: { baseUrl: string; apiKey: string }) => {
    try {
      const res = await fetch(`${baseUrl}/models`, { headers: { authorization: `Bearer ${apiKey}` } })
      if (!res.ok) return { ok: false, status: res.status }
      const data = (await res.json()) as { data?: unknown[] }
      return { ok: true, count: Array.isArray(data.data) ? data.data.length : 0 }
    } catch {
      return { ok: false, status: 0 }
    }
  })
  ipcMain.handle('settings:relaunch', () => {
    app.relaunch()
    app.exit(0)
  })

  startEngine(token)
  createWindow(token)
  // Global shortcut fires even when the app is unfocused; capture happens in the bg.
  if (!globalShortcut.register(SHORTCUT, () => mainWindow?.webContents.send('capture-shortcut'))) {
    console.error(`failed to register global shortcut ${SHORTCUT}`)
  }
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(token)
  })
})

app.on('will-quit', () => globalShortcut.unregisterAll())

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
