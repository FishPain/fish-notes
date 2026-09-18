import React from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CssBaseline, ThemeProvider, createTheme } from '@mui/material'
import { makeApiClient } from './api-client.js'
import { App } from './app.js'

declare global {
  interface Window {
    engine: { baseUrl: string; token: string }
  }
}

export const api = makeApiClient(window.engine)
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
        <App />
      </ThemeProvider>
    </QueryClientProvider>
  </React.StrictMode>
)
