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

export const App = (): React.ReactElement => {
  const { query, setQuery, mode } = useUi()
  const [asked, setAsked] = useState<AskResult | null>(null)

  const results = useQuery({
    queryKey: ['search', query, mode],
    queryFn: () => api.request<SearchHit[]>(`/search?q=${encodeURIComponent(query)}&mode=${mode}`),
    enabled: query.trim().length > 0
  })

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
        <Button variant="contained" onClick={ask} disabled={!query.trim()}>Ask</Button>
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

      {(results.data || []).map((hit) => (
        <Card key={hit.capture.id} sx={{ mb: 1 }}>
          <CardContent>
            <Typography>{hit.capture.content}</Typography>
            {hit.capture.note && (
              <Typography variant="body2" sx={{ mt: 0.5, color: 'primary.light' }}>
                {hit.capture.note}
              </Typography>
            )}
            {hit.capture.source.url && (
              <Typography
                variant="caption"
                component="a"
                href={`${hit.capture.source.url}${hit.capture.source.anchor || ''}`}
                sx={{ color: 'text.secondary', display: 'block', mt: 0.5 }}
              >
                jump to source
              </Typography>
            )}
          </CardContent>
        </Card>
      ))}

      <Typography variant="caption" sx={{ display: 'block', mt: 3, opacity: 0.5 }}>
        Extension token: {window.engine.token} · endpoint {window.engine.baseUrl}
      </Typography>
    </Box>
  )
}
