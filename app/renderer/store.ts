import { create } from 'zustand'

interface UiState {
  query: string
  mode: 'hybrid' | 'keyword' | 'semantic'
  setQuery: (query: string) => void
  setMode: (mode: UiState['mode']) => void
}

export const useUi = create<UiState>((set) => ({
  query: '',
  mode: 'hybrid',
  setQuery: (query) => set({ query }),
  setMode: (mode) => set({ mode })
}))
