import { create } from 'zustand'

interface UiState {
  query: string
  mode: 'hybrid' | 'keyword' | 'semantic'
  view: 'search' | 'canvas'
  selectedCanvasId: number | null
  pendingDraftId: number | null
  setQuery: (query: string) => void
  setMode: (mode: UiState['mode']) => void
  setPendingDraft: (id: number | null) => void
  openSearch: () => void
  openCanvas: (id: number) => void
}

export const useUi = create<UiState>((set) => ({
  query: '',
  mode: 'hybrid',
  view: 'search',
  selectedCanvasId: null,
  pendingDraftId: null,
  setQuery: (query) => set({ query }),
  setMode: (mode) => set({ mode }),
  setPendingDraft: (id) => set({ pendingDraftId: id }),
  openSearch: () => set({ view: 'search', selectedCanvasId: null }),
  openCanvas: (id) => set({ view: 'canvas', selectedCanvasId: id })
}))
