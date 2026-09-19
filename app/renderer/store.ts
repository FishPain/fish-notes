import { create } from 'zustand'

interface UiState {
  query: string
  view: 'search' | 'canvas'
  selectedCanvasId: number | null
  pendingDraftId: number | null
  setQuery: (query: string) => void
  setPendingDraft: (id: number | null) => void
  openSearch: () => void
  openCanvas: (id: number) => void
}

export const useUi = create<UiState>((set) => ({
  query: '',
  view: 'search',
  selectedCanvasId: null,
  pendingDraftId: null,
  setQuery: (query) => set({ query }),
  setPendingDraft: (id) => set({ pendingDraftId: id }),
  openSearch: () => set({ view: 'search', selectedCanvasId: null }),
  openCanvas: (id) => set({ view: 'canvas', selectedCanvasId: id })
}))
