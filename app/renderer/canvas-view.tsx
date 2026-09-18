import React, { useEffect, useRef } from 'react'
import { Box, Typography, Chip, Stack, CircularProgress } from '@mui/material'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from './main.js'
import { useUi } from './store.js'
import { NoteEditor, NoteEditorHandle } from './note-editor.js'

interface Canvas {
  id: number
  title: string
  doc: unknown
  newSourceCount?: number
}

export const CanvasView = ({ canvasId }: { canvasId: number }): React.ReactElement => {
  const qc = useQueryClient()
  const editorRef = useRef<NoteEditorHandle>(null)
  const { pendingDraftId, setPendingDraft } = useUi()

  const canvas = useQuery({
    queryKey: ['canvas', canvasId],
    queryFn: () => api.request<Canvas>(`/canvas/${canvasId}`),
    refetchInterval: 5000
  })

  const save = useMutation({
    mutationFn: (doc: unknown) => api.request(`/canvas/${canvasId}`, { method: 'PATCH', body: JSON.stringify({ doc }) })
  })

  const runComplete = async (prompt: string): Promise<string> => {
    const docText = JSON.stringify(canvas.data?.doc ?? {})
    const res = await api.request<{ markdown: string }>(`/canvas/${canvasId}/complete`, {
      method: 'POST',
      body: JSON.stringify({ prompt, doc: docText })
    })
    return res.markdown
  }

  // One-time draft when the note was created with "draft from sources".
  useEffect(() => {
    if (pendingDraftId !== canvasId || !editorRef.current) return
    setPendingDraft(null)
    api
      .request<{ markdown: string }>(`/canvas/${canvasId}/draft`, { method: 'POST' })
      .then((r) => {
        editorRef.current?.insertMarkdown(r.markdown)
        qc.invalidateQueries({ queryKey: ['canvas', canvasId] })
      })
      .catch(() => undefined)
  }, [pendingDraftId, canvasId, setPendingDraft, qc])

  if (!canvas.data) return <CircularProgress sx={{ m: 4 }} />
  const newCount = canvas.data.newSourceCount ?? 0

  return (
    <Box sx={{ flex: 1, p: 3, overflow: 'auto' }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Typography variant="h5">{canvas.data.title}</Typography>
        {newCount > 0 && (
          <Chip size="small" color="warning" label={`${newCount} new source${newCount === 1 ? '' : 's'} — use /llm to pull in`} />
        )}
      </Stack>
      <Typography variant="caption" sx={{ opacity: 0.5, display: 'block', mb: 1 }}>
        Type <b>/llm your instruction</b> then Enter to have AI write here from your sources.
      </Typography>
      <NoteEditor key={canvasId} ref={editorRef} doc={canvas.data.doc} onChange={(d) => save.mutate(d)} onCommand={runComplete} />
    </Box>
  )
}
