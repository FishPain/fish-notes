import { contextBridge, ipcRenderer } from 'electron'

// Expose the engine base URL + token to the renderer (read from args main injected).
const arg = (name: string): string => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.split('=')[1] : ''
}

contextBridge.exposeInMainWorld('engine', {
  baseUrl: `http://127.0.0.1:${arg('engine-port') || '7645'}`,
  token: arg('engine-token')
})

// Native screen-region capture (main runs macOS `screencapture`).
contextBridge.exposeInMainWorld('capture', {
  region: () => ipcRenderer.invoke('capture-region'),
  saveImage: (dataUrl: string, name: string) => ipcRenderer.invoke('save-image', { dataUrl, name }),
  onShortcut: (cb: () => void) => {
    const listener = (): void => cb()
    ipcRenderer.on('capture-shortcut', listener)
    return () => ipcRenderer.removeListener('capture-shortcut', listener)
  }
})

// AI/proxy configuration (persisted to userData/settings.json by main).
contextBridge.exposeInMainWorld('settings', {
  get: () => ipcRenderer.invoke('settings:get'),
  save: (cfg: unknown) => ipcRenderer.invoke('settings:save', cfg),
  test: (baseUrl: string, apiKey: string) => ipcRenderer.invoke('settings:test', { baseUrl, apiKey }),
  openDataDir: () => ipcRenderer.invoke('settings:openDataDir'),
  relaunch: () => ipcRenderer.invoke('settings:relaunch')
})
