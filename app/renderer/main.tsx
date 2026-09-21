import React from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Box, Button, CssBaseline, ThemeProvider, Typography, createTheme } from '@mui/material'
import { App } from './app.js'

// Re-exported so existing imports (`import { api } from './main.js'`) keep working;
// the client itself lives in engine.ts to avoid an import cycle with the store.
export { api } from './engine.js'

// Without this, any render-time throw unmounts React to a blank white screen
// (common with HMR mid-edit). Show the error + a reload button instead.
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error): { error: Error } {
    return { error }
  }
  render(): React.ReactNode {
    if (!this.state.error) return this.props.children
    return (
      <Box sx={{ p: 4, fontFamily: 'monospace' }}>
        <Typography variant="h6" color="error" gutterBottom>Something crashed</Typography>
        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', opacity: 0.8, mb: 2 }}>
          {this.state.error.message}
          {'\n\n'}
          {this.state.error.stack}
        </Typography>
        <Button variant="contained" onClick={() => window.location.reload()}>Reload</Button>
      </Box>
    )
  }
}

declare global {
  interface Window {
    engine: { baseUrl: string; token: string }
    capture: {
      region: () => Promise<{ cancelled?: boolean; pngBase64?: string; error?: string }>
      saveImage: (dataUrl: string, name: string) => Promise<{ saved?: boolean; path?: string; cancelled?: boolean }>
      onShortcut: (cb: () => void) => () => void
    }
    settings: {
      get: () => Promise<AiSettings>
      save: (cfg: Partial<AiSettings>) => Promise<void>
      test: (baseUrl: string, apiKey: string) => Promise<{ ok: boolean; count?: number; status?: number }>
      relaunch: () => void
    }
  }
}

export interface AiSettings {
  baseUrl: string
  apiKey: string
  chatModel: string
  ocrModel: string
}

const queryClient = new QueryClient()

const serif = "'Iowan Old Style', 'Palatino', Georgia, serif"
const theme = createTheme({
  palette: {
    mode: 'dark',
    background: { default: '#1b1917', paper: '#211e1b' },
    primary: { main: '#c98a3a', light: '#d9a05a' },
    warning: { main: '#c98a3a' },
    text: { primary: '#e9e4dc', secondary: '#b8afa3' },
    divider: 'rgba(255,255,255,.08)'
  },
  shape: { borderRadius: 10 },
  typography: {
    fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
    h4: { fontFamily: serif, fontWeight: 600 },
    h5: { fontFamily: serif, fontWeight: 600 },
    h6: { fontFamily: serif, fontWeight: 600 }
  }
})

createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </ThemeProvider>
    </QueryClientProvider>
  </React.StrictMode>
)
