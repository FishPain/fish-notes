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
const theme = createTheme({ palette: { mode: 'dark' } })

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
