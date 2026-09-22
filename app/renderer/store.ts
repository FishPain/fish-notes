import { create } from 'zustand'
import { api } from './engine.js'

let jobSeq = 0

interface UiState {
  query: string
  view: 'search' | 'canvas'
  selectedCanvasId: number | null
  pendingDraftId: number | null
  selecting: boolean // native region selector is open (button disabled)
  ocrJobs: number[] // in-flight OCR jobs (each renders a "reading…" card)
  uploadJobs: { id: number; name: string }[] // in-flight document uploads
  setQuery: (query: string) => void
  setPendingDraft: (id: number | null) => void
  openSearch: () => void
  openCanvas: (id: number) => void
  captureScreen: () => Promise<void>
  uploadDoc: (name: string, text: string) => Promise<void>
}

export const useUi = create<UiState>((set, get) => ({
  query: '',
  view: 'search',
  selectedCanvasId: null,
  pendingDraftId: null,
  selecting: false,
  ocrJobs: [],
  uploadJobs: [],
  setQuery: (query) => set({ query }),
  setPendingDraft: (id) => set({ pendingDraftId: id }),
  openSearch: () => set({ view: 'search', selectedCanvasId: null }),
  openCanvas: (id) => set({ view: 'canvas', selectedCanvasId: id }),

  // Shared by the "Capture screen" button and the global shortcut. Phase 1 (region
  // select) blocks briefly; phase 2 (OCR + store) runs in the background so you can
  // capture the next one immediately. Uses window.engine directly (no query client).
  captureScreen: async () => {
    if (get().selecting) return // don't open two selectors at once
    set({ selecting: true })
    let shot: { cancelled?: boolean; pngBase64?: string; error?: string }
    try {
      shot = await window.capture.region()
    } finally {
      set({ selecting: false })
    }
    if (shot.error === 'permission') {
      window.alert(
        'Fish Notes needs Screen Recording permission.\n\nI opened System Settings → Privacy & Security → Screen Recording. Enable Fish Notes (or "Electron" in dev), then fully quit and reopen the app and try again.'
      )
      return
    }
    if (shot.cancelled || !shot.pngBase64) return
    const id = ++jobSeq
    set((s) => ({ ocrJobs: [...s.ocrJobs, id] }))
    try {
      await api.request('/capture/screen', { method: 'POST', body: JSON.stringify({ pngBase64: shot.pngBase64 }) })
    } catch {
      window.alert('Could not read text from that screenshot — try a clearer region.')
    } finally {
      set((s) => ({ ocrJobs: s.ocrJobs.filter((x) => x !== id) }))
    }
  },

  // Upload a text document: the engine chunks + embeds it in the background.
  uploadDoc: async (name, text) => {
    const id = ++jobSeq
    set((s) => ({ uploadJobs: [...s.uploadJobs, { id, name }] }))
    try {
      await api.request('/capture/upload', { method: 'POST', body: JSON.stringify({ name, text }) })
    } catch {
      window.alert(`Could not upload "${name}".`)
    } finally {
      set((s) => ({ uploadJobs: s.uploadJobs.filter((j) => j.id !== id) }))
    }
  }
}))
