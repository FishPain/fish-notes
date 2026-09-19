import React, { useState } from 'react'
import { Box, TextField, Typography, Card, CardContent, Button, Stack, Chip, IconButton, CircularProgress } from '@mui/material'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faTrash, faCamera } from '@fortawesome/free-solid-svg-icons'
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
  screenshot?: string | null
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
            {capture.screenshot && (
              <Box
                component="img"
                src={capture.screenshot}
                alt="captured region"
                sx={{ display: 'block', maxHeight: 140, maxWidth: '100%', mt: 1, borderRadius: 1, border: 1, borderColor: 'divider' }}
              />
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
  const { query, setQuery } = useUi()
  const qc = useQueryClient()
  const [asked, setAsked] = useState<AskResult | null>(null)
  const searching = query.trim().length > 0

  // Grab a screen region (native selector via main), OCR it, store as a capture.
  const captureMut = useMutation({
    mutationFn: async () => {
      const shot = await window.capture.region()
      if (shot.cancelled || !shot.pngBase64) return null
      return api.request('/capture/screen', { method: 'POST', body: JSON.stringify({ pngBase64: shot.pngBase64 }) })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['captures'] }),
    onError: () => window.alert('Could not read text from that selection — try a clearer region.')
  })

  // Live search is traditional keyword (FTS) — fast, local, no embeddings — so it
  // can fire per keystroke. Embeddings are reserved for Ask (grounding the answer).
  const all = useQuery({
    queryKey: ['captures'],
    queryFn: () => api.request<Capture[]>('/capture'),
    enabled: !searching,
    refetchInterval: 4000
  })
  const results = useQuery({
    queryKey: ['search', query],
    queryFn: () => api.request<SearchHit[]>(`/search?q=${encodeURIComponent(query)}&mode=keyword`),
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
    if (query.trim() && !askMut.isPending) askMut.mutate()
  }

  return (
    <Box sx={{ flex: 1, overflow: 'auto', maxWidth: 900, mx: 'auto', p: 3 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Typography variant="h4">Notes</Typography>
        <Button
          variant="outlined"
          startIcon={captureMut.isPending ? <CircularProgress size={16} color="inherit" /> : <FontAwesomeIcon icon={faCamera} />}
          onClick={() => captureMut.mutate()}
          disabled={captureMut.isPending}
          sx={{ textTransform: 'none' }}
        >
          {captureMut.isPending ? 'Reading text…' : 'Capture screen'}
        </Button>
      </Stack>
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
