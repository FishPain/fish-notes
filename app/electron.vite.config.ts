import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

const root = import.meta.dirname

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: { rollupOptions: { input: resolve(root, 'electron/main.ts') } }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: { rollupOptions: { input: resolve(root, 'electron/preload.ts') } }
  },
  renderer: {
    root: resolve(root, 'renderer'),
    build: { rollupOptions: { input: resolve(root, 'renderer/index.html') } },
    plugins: [react()]
  }
})
