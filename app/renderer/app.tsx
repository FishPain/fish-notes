import React, { useEffect, useState } from 'react'
import { Box, TextField, Typography, Card, CardContent, Button, Stack, Chip, IconButton, CircularProgress } from '@mui/material'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faTrash, faCamera, faDownload } from '@fortawesome/free-solid-svg-icons'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useUi } from './store.js'
import { api } from './main.js'
import { CanvasList } from './canvas-list.js'
import { CanvasView } from './canvas-view.js'

interface Capture {
  id: number
  content: string
  note: string
  tags: string[]
  source: { type?: string; url?: string; anchor?: string }
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
          <Box sx={{ flex: 1, minWidth: 0 }}>
            {capture.source.type === 'screen' ? (
              <Box
                sx={{
                  overflowX: 'auto',
                  '& table': { borderCollapse: 'collapse', my: 1 },
                  '& th, & td': { border: '1px solid', borderColor: 'divider', px: 1, py: 0.5, textAlign: 'left' },
                  '& th': { bgcolor: 'rgba(255,255,255,.04)' },
                  '& pre': { bgcolor: 'rgba(255,255,255,.05)', p: 1, borderRadius: 1, overflow: 'auto' },
                  '& code': { bgcolor: 'rgba(255,255,255,.06)', px: 0.5, borderRadius: 0.5 },
                  '& p': { my: 0.5 },
                  '& a': { color: 'primary.light' }
                }}
              >
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{capture.content}</ReactMarkdown>
              </Box>
            ) : (
              <Typography>{capture.content}</Typography>
            )}
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
              <>
                <Box
                  component="img"
                  src={capture.screenshot}
                  alt="captured region"
                  sx={{ display: 'block', maxHeight: 140, maxWidth: '100%', mt: 1, borderRadius: 1, border: 1, borderColor: 'divider' }}
                />
                <Button
                  size="small"
                  startIcon={<FontAwesomeIcon icon={faDownload} />}
                  onClick={() => window.capture.saveImage(capture.screenshot as string, `fishnotes-capture-${capture.id}.png`)}
                  sx={{ mt: 0.5, textTransform: 'none' }}
                >
                  Export image
                </Button>
              </>
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
  const { query, setQuery, selecting, ocrJobs, captureScreen } = useUi()
  const [asked, setAsked] = useState<AskResult | null>(null)
  const searching = query.trim().length > 0

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

  // When an OCR job finishes (ocrJobs shrinks), pull the fresh capture in promptly
  // rather than waiting for the 4s poll. (captureScreen lives in the store, outside
  // React Query, so it can't invalidate itself.)
  const jobCount = ocrJobs.length
  useEffect(() => {
    if (!searching) all.refetch()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobCount])

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
          startIcon={selecting ? <CircularProgress size={16} color="inherit" /> : <FontAwesomeIcon icon={faCamera} />}
          onClick={captureScreen}
          disabled={selecting}
          sx={{ textTransform: 'none' }}
        >
          Capture screen{ocrJobs.length ? ` (${ocrJobs.length})` : ''}
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

      {ocrJobs.map((id) => (
        <Card key={`ocr-${id}`} sx={{ mb: 1 }}>
          <CardContent>
            <Stack direction="row" spacing={1.5} alignItems="center">
              <CircularProgress size={18} />
              <Typography variant="body2" sx={{ opacity: 0.7 }}>Reading text from screenshot…</Typography>
            </Stack>
          </CardContent>
        </Card>
      ))}

      {shown.length === 0 && ocrJobs.length === 0 && (
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
  const { view, selectedCanvasId, captureScreen } = useUi()
  // Global shortcut (Cmd/Ctrl+Shift+9) triggers capture from any view, even unfocused.
  useEffect(() => window.capture.onShortcut(() => captureScreen()), [captureScreen])
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
