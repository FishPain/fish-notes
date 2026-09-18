import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { openDb } from '../src/db.js'
import { buildServer } from '../src/server.js'
import { makeGenerate } from '../src/generator.js'
import { AI } from '../src/constants.js'
import { loadOrCreateToken } from './engine-token.js'

const PORT = 7645

const startEngine = (token: string): void => {
  const dbPath = join(app.getPath('userData'), 'canvas.db')
  const db = openDb(dbPath)
  const server = buildServer(db, makeGenerate(AI), token)
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
  startEngine(token)
  createWindow(token)
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(token)
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
