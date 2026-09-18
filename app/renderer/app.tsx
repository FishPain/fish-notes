import React, { useState } from 'react'
import { Box, TextField, Typography, Card, CardContent, Button, Stack, Chip } from '@mui/material'
import { useQuery } from '@tanstack/react-query'
import { useUi } from './store.js'
import { api } from './main.js'

interface Capture {
  id: number
  content: string
  note: string
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

const CaptureCard = ({ capture }: { capture: Capture }): React.ReactElement => (
  <Card sx={{ mb: 1 }}>
    <CardContent>
      <Typography>{capture.content}</Typography>
      {capture.note && (
        <Typography variant="body2" sx={{ mt: 0.5, color: 'primary.light' }}>
          {capture.note}
        </Typography>
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
    </CardContent>
  </Card>
)

export const App = (): React.ReactElement => {
  const { query, setQuery, mode } = useUi()
  const [asked, setAsked] = useState<AskResult | null>(null)
  const searching = query.trim().length > 0

  // Default view: all captures, newest first. Search view: hybrid results.
  const all = useQuery({
    queryKey: ['captures'],
    queryFn: () => api.request<Capture[]>('/capture'),
    enabled: !searching
  })
  const results = useQuery({
    queryKey: ['search', query, mode],
    queryFn: () => api.request<SearchHit[]>(`/search?q=${encodeURIComponent(query)}&mode=${mode}`),
    enabled: searching
  })

  const shown: Capture[] = searching
    ? (results.data || []).map((h) => h.capture)
    : all.data || []

  const ask = async (): Promise<void> => {
    const r = await api.request<AskResult>('/ask', {
      method: 'POST',
      body: JSON.stringify({ question: query })
    })
    setAsked(r)
  }

  return (
    <Box sx={{ maxWidth: 900, mx: 'auto', p: 3 }}>
      <Typography variant="h5" sx={{ mb: 2 }}>Canvas Notes</Typography>
      <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
        <TextField
          fullWidth
          placeholder="Search your sources or ask a question…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <Button variant="contained" onClick={ask} disabled={!searching}>Ask</Button>
      </Stack>

      {asked && (
        <Card sx={{ mb: 2, bgcolor: 'rgba(120,140,255,.08)' }}>
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
