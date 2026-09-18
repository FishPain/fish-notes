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
interface Canvas {
  id: number
  title: string
  doc: Segment[]
}

const SegmentBlock = ({ canvasId, segment }: { canvasId: number; segment: Segment }): React.ReactElement => {
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
            {segment.citations.map((id) => (
              <Chip key={id} size="small" variant="outlined" label={`#${id}`} />
            ))}
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
    queryFn: () => api.request<Canvas>(`/canvas/${canvasId}`)
  })

  const refresh = useMutation({
    mutationFn: () => api.request<{ doc: Segment[] }>(`/canvas/${canvasId}/collate`, { method: 'POST' }),
    onMutate: () => setError(''),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['canvas', canvasId] }),
    onError: () => setError('Collate failed — is a model available? (Ollama running, or a Claude key set.)')
  })

  if (!canvas.data) return <CircularProgress sx={{ m: 4 }} />
  const doc = canvas.data.doc

  return (
    <Box sx={{ flex: 1, p: 3, overflow: 'auto' }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Typography variant="h5">{canvas.data.title}</Typography>
        <Button variant="outlined" onClick={() => refresh.mutate()} disabled={refresh.isPending}>
          {refresh.isPending ? 'Collating…' : '↻ Refresh'}
        </Button>
      </Stack>

      {error && <Typography color="error" variant="body2" sx={{ mb: 2 }}>{error}</Typography>}

      {doc.length === 0 && (
        <Typography variant="body2" sx={{ opacity: 0.6 }}>
          Empty. Click Refresh to collate a draft from your saved sources.
        </Typography>
      )}

      {doc.map((segment) => (
        <SegmentBlock key={segment.id} canvasId={canvasId} segment={segment} />
      ))}
    </Box>
  )
}
