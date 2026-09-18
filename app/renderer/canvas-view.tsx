import React, { useRef } from 'react'
import { Box, Typography, Button, Chip, Stack, CircularProgress } from '@mui/material'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from './main.js'
import { NoteEditor, NoteEditorHandle } from './note-editor.js'

interface Capture {
  id: number
  source: { url?: string; anchor?: string }
}
interface Canvas {
  id: number
  title: string
  doc: unknown
  newSourceCount?: number
}
interface Section {
  heading: string
  text: string
  citations: number[]
}

export const CanvasView = ({ canvasId }: { canvasId: number }): React.ReactElement => {
  const qc = useQueryClient()
  const editorRef = useRef<NoteEditorHandle>(null)
  const [error, setError] = React.useState('')

  const canvas = useQuery({
    queryKey: ['canvas', canvasId],
    queryFn: () => api.request<Canvas>(`/canvas/${canvasId}`),
    refetchInterval: 5000
  })
  const captures = useQuery({
    queryKey: ['captures'],
    queryFn: () => api.request<Capture[]>('/capture')
  })

  const save = useMutation({
    mutationFn: (doc: unknown) => api.request(`/canvas/${canvasId}`, { method: 'PATCH', body: JSON.stringify({ doc }) })
  })

  const draft = useMutation({
    mutationFn: () => api.request<{ sections: Section[] }>(`/canvas/${canvasId}/draft`, { method: 'POST' }),
    onMutate: () => setError(''),
    onSuccess: (res) => {
      editorRef.current?.insertSections(res.sections)
      qc.invalidateQueries({ queryKey: ['canvas', canvasId] })
    },
    onError: () => setError('Draft failed — is a model available? (Check the proxy / OPENAI_API_KEY.)')
  })

  if (!canvas.data) return <CircularProgress sx={{ m: 4 }} />
  const captureMap = new Map((captures.data || []).map((c) => [c.id, c]))
  const newCount = canvas.data.newSourceCount ?? 0

  return (
    <Box sx={{ flex: 1, p: 3, overflow: 'auto' }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Typography variant="h5">{canvas.data.title}</Typography>
        <Stack direction="row" spacing={1} alignItems="center">
          {newCount > 0 && <Chip size="small" color="warning" label={`${newCount} new source${newCount === 1 ? '' : 's'}`} />}
          <Button variant="outlined" onClick={() => draft.mutate()} disabled={draft.isPending}>
            {draft.isPending ? 'Drafting…' : 'Draft from sources'}
          </Button>
        </Stack>
      </Stack>

      {error && <Typography color="error" variant="body2" sx={{ mb: 2 }}>{error}</Typography>}

      <NoteEditor
        key={canvasId}
        ref={editorRef}
        doc={canvas.data.doc}
        captures={captureMap}
        onChange={(doc) => save.mutate(doc)}
      />
    </Box>
  )
}
