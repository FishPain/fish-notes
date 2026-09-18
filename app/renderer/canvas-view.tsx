import React, { useState } from 'react'
import { Box, Typography, Button, Card, CardContent, Chip, Stack, TextField, CircularProgress } from '@mui/material'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from './main.js'

interface Segment {
  id: string
  heading: string
  text: string
  origin: 'ai' | 'user'
  citations: number[]
}
interface Capture {
  id: number
  content: string
  source: { url?: string; anchor?: string }
}
interface Canvas {
  id: number
  title: string
  doc: Segment[]
  newSourceCount?: number
}

const sourceLabel = (c: Capture | undefined, id: number): string => {
  if (!c) return `#${id}`
  if (c.source.url) {
    try {
      return new URL(c.source.url).hostname.replace(/^www\./, '')
    } catch {
      // fall through to a content snippet
    }
  }
  return c.content.slice(0, 24)
}

const openSource = (c: Capture | undefined): void => {
  if (c?.source.url) window.open(`${c.source.url}${c.source.anchor || ''}`, '_blank')
}

const SegmentBlock = ({
  canvasId,
  segment,
  captures
}: {
  canvasId: number
  segment: Segment
  captures: Map<number, Capture>
}): React.ReactElement => {
  const qc = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(segment.text)
  const mine = segment.origin === 'user'

  const save = useMutation({
    mutationFn: (t: string) =>
      api.request<Canvas>(`/canvas/${canvasId}/segments/${segment.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ text: t })
      }),
    onSuccess: () => {
      setEditing(false)
      qc.invalidateQueries({ queryKey: ['canvas', canvasId] })
    }
  })

  return (
    <Card sx={{ mb: 1, borderLeft: 3, borderColor: mine ? 'primary.main' : 'transparent', bgcolor: mine ? 'rgba(120,140,255,.06)' : undefined }}>
      <CardContent>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Typography variant="subtitle2">{segment.heading}</Typography>
          <Chip size="small" label={mine ? 'You · pinned' : `AI · ${segment.citations.length} sources`} />
        </Stack>
        {editing ? (
          <Box sx={{ mt: 1 }}>
            <TextField fullWidth multiline value={text} onChange={(e) => setText(e.target.value)} />
            <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
              <Button size="small" variant="contained" onClick={() => save.mutate(text)}>Save (locks it)</Button>
              <Button size="small" onClick={() => { setText(segment.text); setEditing(false) }}>Cancel</Button>
            </Stack>
          </Box>
        ) : (
          <Typography sx={{ mt: 0.5, whiteSpace: 'pre-wrap', cursor: 'text' }} onClick={() => setEditing(true)}>
            {segment.text}
          </Typography>
        )}
        {segment.citations.length > 0 && (
          <Stack direction="row" spacing={0.5} sx={{ mt: 1, flexWrap: 'wrap' }}>
            {segment.citations.map((id) => {
              const c = captures.get(id)
              return (
                <Chip
                  key={id}
                  size="small"
                  variant="outlined"
                  clickable={!!c?.source.url}
                  onClick={() => openSource(c)}
                  label={sourceLabel(c, id)}
                />
              )
            })}
          </Stack>
        )}
      </CardContent>
    </Card>
  )
}

export const CanvasView = ({ canvasId }: { canvasId: number }): React.ReactElement => {
  const qc = useQueryClient()
  const [error, setError] = useState('')

  const canvas = useQuery({
    queryKey: ['canvas', canvasId],
    queryFn: () => api.request<Canvas>(`/canvas/${canvasId}`),
    refetchInterval: 5000 // keep the "new sources" nudge current as captures arrive
  })
  const captures = useQuery({
    queryKey: ['captures'],
    queryFn: () => api.request<Capture[]>('/capture')
  })

  const refresh = useMutation({
    mutationFn: () => api.request<{ doc: Segment[] }>(`/canvas/${canvasId}/collate`, { method: 'POST' }),
    onMutate: () => setError(''),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['canvas', canvasId] }),
    onError: () => setError('Collate failed — is a model available? (Check OPENAI_API_KEY / the proxy at localhost:6655.)')
  })

  if (!canvas.data) return <CircularProgress sx={{ m: 4 }} />
  const doc = canvas.data.doc
  const captureMap = new Map((captures.data || []).map((c) => [c.id, c]))
  const newCount = canvas.data.newSourceCount ?? 0

  return (
    <Box sx={{ flex: 1, p: 3, overflow: 'auto' }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Typography variant="h5">{canvas.data.title}</Typography>
        <Stack direction="row" spacing={1} alignItems="center">
          {newCount > 0 && (
            <Chip size="small" color="warning" label={`${newCount} new source${newCount === 1 ? '' : 's'}`} />
          )}
          <Button variant="outlined" onClick={() => refresh.mutate()} disabled={refresh.isPending}>
            {refresh.isPending ? 'Collating…' : '↻ Refresh'}
          </Button>
        </Stack>
      </Stack>

      {error && <Typography color="error" variant="body2" sx={{ mb: 2 }}>{error}</Typography>}

      {doc.length === 0 && (
        <Typography variant="body2" sx={{ opacity: 0.6 }}>
          Empty. Click Refresh to collate a draft from your saved sources.
        </Typography>
      )}

      {doc.map((segment) => (
        <SegmentBlock key={segment.id} canvasId={canvasId} segment={segment} captures={captureMap} />
      ))}
    </Box>
  )
}
