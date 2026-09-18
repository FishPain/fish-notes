import React, { useState } from 'react'
import { Box, TextField, Typography, Card, CardContent, Button, Stack, Chip, IconButton, CircularProgress } from '@mui/material'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faTrash } from '@fortawesome/free-solid-svg-icons'
import { useUi } from './store.js'
import { api } from './main.js'
import { CanvasList } from './canvas-list.js'
import { CanvasView } from './canvas-view.js'

interface Capture {
  id: number
  content: string
  note: string
  tags: string[]
  source: { url?: string; anchor?: string }
}
interface SearchHit {
  capture: Capture
  score: number
}
interface AskResult {
  answer: string
  citations: Capture[]
}

const CaptureCard = ({ capture }: { capture: Capture }): React.ReactElement => {
  const qc = useQueryClient()
  const del = useMutation({
    mutationFn: () => api.request<void>(`/capture/${capture.id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['captures'] })
      qc.invalidateQueries({ queryKey: ['search'] })
    }
  })

  return (
    <Card sx={{ mb: 1 }}>
      <CardContent>
        <Stack direction="row" alignItems="flex-start" spacing={1}>
          <Box sx={{ flex: 1 }}>
            <Typography>{capture.content}</Typography>
            {capture.note && (
              <Typography variant="body2" sx={{ mt: 0.5, color: 'primary.light' }}>
                {capture.note}
              </Typography>
            )}
            {capture.tags?.length > 0 && (
              <Stack direction="row" spacing={0.5} sx={{ mt: 0.5, flexWrap: 'wrap' }}>
                {capture.tags.map((t) => (
                  <Chip key={t} size="small" label={t} />
                ))}
              </Stack>
            )}
            {capture.source.url && (
              <Typography
                variant="caption"
                component="a"
                href={`${capture.source.url}${capture.source.anchor || ''}`}
                target="_blank"
                rel="noreferrer"
                sx={{ color: 'text.secondary', display: 'block', mt: 0.5 }}
              >
                jump to source
              </Typography>
            )}
          </Box>
          <IconButton size="small" aria-label="delete" onClick={() => del.mutate()} disabled={del.isPending}>
            <FontAwesomeIcon icon={faTrash} />
          </IconButton>
        </Stack>
      </CardContent>
    </Card>
  )
}

const SearchView = (): React.ReactElement => {
  const { query, setQuery, mode } = useUi()
  const [asked, setAsked] = useState<AskResult | null>(null)
  const searching = query.trim().length > 0

  // Default view: all captures, newest first. Search view: hybrid results.
  // Poll so captures sent from the browser extension show up without a manual refresh.
  const all = useQuery({
    queryKey: ['captures'],
    queryFn: () => api.request<Capture[]>('/capture'),
    enabled: !searching,
    refetchInterval: 4000
  })
  const results = useQuery({
    queryKey: ['search', query, mode],
    queryFn: () => api.request<SearchHit[]>(`/search?q=${encodeURIComponent(query)}&mode=${mode}`),
    enabled: searching
  })

  const shown: Capture[] = searching
    ? (results.data || []).map((h) => h.capture)
    : all.data || []

  const askMut = useMutation({
    mutationFn: () =>
      api.request<AskResult>('/ask', { method: 'POST', body: JSON.stringify({ question: query }) }),
    onSuccess: (r) => setAsked(r)
  })
  const ask = (): void => {
    if (searching && !askMut.isPending) askMut.mutate()
  }

  return (
    <Box sx={{ flex: 1, overflow: 'auto', maxWidth: 900, mx: 'auto', p: 3 }}>
      <Typography variant="h4" sx={{ mb: 2 }}>Notes</Typography>
      <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
        <TextField
          fullWidth
          placeholder="Search your sources or ask a question…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') ask()
          }}
        />
        <Button variant="contained" onClick={ask} disabled={!searching || askMut.isPending} sx={{ minWidth: 88 }}>
          {askMut.isPending ? <CircularProgress size={20} color="inherit" /> : 'Ask'}
        </Button>
      </Stack>

      {askMut.isPending && (
        <Card sx={{ mb: 2, bgcolor: 'rgba(201,138,58,.08)' }}>
          <CardContent>
            <Stack direction="row" spacing={1.5} alignItems="center">
              <CircularProgress size={18} />
              <Typography variant="body2" sx={{ opacity: 0.7 }}>Thinking…</Typography>
            </Stack>
          </CardContent>
        </Card>
      )}

      {asked && !askMut.isPending && (
        <Card sx={{ mb: 2, bgcolor: 'rgba(201,138,58,.08)' }}>
          <CardContent>
            <Typography variant="subtitle2" sx={{ opacity: 0.7 }}>Answer</Typography>
            <Typography sx={{ whiteSpace: 'pre-wrap' }}>{asked.answer}</Typography>
            <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: 'wrap' }}>
              {asked.citations.map((c) => (
                <Chip key={c.id} size="small" label={c.source.url || `#${c.id}`} />
              ))}
            </Stack>
          </CardContent>
        </Card>
      )}

      <Typography variant="subtitle2" sx={{ mb: 1, opacity: 0.6 }}>
        {searching ? `Results (${shown.length})` : `All captures (${shown.length})`}
      </Typography>

      {shown.length === 0 && (
        <Typography variant="body2" sx={{ opacity: 0.5 }}>
          {searching ? 'No matches.' : 'No captures yet — clip something with the extension.'}
        </Typography>
      )}

      {shown.map((capture) => (
        <CaptureCard key={capture.id} capture={capture} />
      ))}

      <Typography variant="caption" sx={{ display: 'block', mt: 3, opacity: 0.5 }}>
        Extension token: {window.engine.token} · endpoint {window.engine.baseUrl}
      </Typography>
    </Box>
  )
}

export const App = (): React.ReactElement => {
  const { view, selectedCanvasId } = useUi()
  return (
    <Box sx={{ display: 'flex', height: '100vh' }}>
      <CanvasList />
      {view === 'canvas' && selectedCanvasId !== null ? (
        <CanvasView canvasId={selectedCanvasId} />
      ) : (
        <SearchView />
      )}
    </Box>
  )
}
