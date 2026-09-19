import React, { useEffect, useRef, useState } from 'react'
import {
  Box, Typography, Chip, Stack, CircularProgress,
  Dialog, DialogTitle, DialogContent, DialogActions, Button
} from '@mui/material'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faArrowsRotate } from '@fortawesome/free-solid-svg-icons'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { api } from './main.js'
import { useUi } from './store.js'
import { NoteEditor, NoteEditorHandle } from './note-editor.js'

interface Canvas {
  id: number
  title: string
  doc: unknown
  newSourceCount?: number
}

interface ModalState {
  open: boolean
  loading: boolean
  markdown: string
  title: string
}

export const CanvasView = ({ canvasId }: { canvasId: number }): React.ReactElement => {
  const qc = useQueryClient()
  const editorRef = useRef<NoteEditorHandle>(null)
  const { pendingDraftId, setPendingDraft } = useUi()
  const [modal, setModal] = useState<ModalState>({ open: false, loading: false, markdown: '', title: '' })
  const resolverRef = useRef<((v: string) => void) | null>(null)

  const canvas = useQuery({
    queryKey: ['canvas', canvasId],
    queryFn: () => api.request<Canvas>(`/canvas/${canvasId}`),
    refetchInterval: 5000
  })

  const save = useMutation({
    mutationFn: (doc: unknown) => api.request(`/canvas/${canvasId}`, { method: 'PATCH', body: JSON.stringify({ doc }) })
  })

  // Open the modal, run the fetch (loading), show a preview, resolve with the
  // markdown on Insert or '' on Cancel/error.
  const requestAi = (title: string, fetchFn: () => Promise<string>): Promise<string> =>
    new Promise((resolve) => {
      resolverRef.current = resolve
      setModal({ open: true, loading: true, markdown: '', title })
      fetchFn()
        .then((md) => setModal({ open: true, loading: false, markdown: md, title }))
        .catch(() => {
          resolve('')
          resolverRef.current = null
          setModal({ open: false, loading: false, markdown: '', title: '' })
        })
    })

  const closeWith = (value: string): void => {
    resolverRef.current?.(value)
    resolverRef.current = null
    setModal((m) => ({ ...m, open: false }))
  }

  // Re-draft from sources and replace only the AI-authored blocks (your edits stay).
  const regenerate = (): void => {
    if (!window.confirm('Regenerate AI content? Your own edits stay; AI-written blocks are replaced.')) return
    requestAi('Regenerate AI content', () =>
      api.request<{ markdown: string }>(`/canvas/${canvasId}/draft`, { method: 'POST' }).then((r) => r.markdown)
    ).then((md) => {
      if (md) editorRef.current?.replaceAiWith(md)
      qc.invalidateQueries({ queryKey: ['canvas', canvasId] })
    })
  }

  const runComplete = (prompt: string): Promise<string> =>
    requestAi('AI · /llm', () => {
      const docText = JSON.stringify(canvas.data?.doc ?? {})
      return api
        .request<{ markdown: string }>(`/canvas/${canvasId}/complete`, { method: 'POST', body: JSON.stringify({ prompt, doc: docText }) })
        .then((r) => r.markdown)
    })

  // One-time draft when created with "draft from sources", shown in the modal too.
  // Gate on canvas.data (not editorRef): on a fresh create the editor isn't
  // mounted yet, and the ref never triggers a re-run — the doc load does.
  useEffect(() => {
    if (pendingDraftId !== canvasId || !canvas.data) return
    setPendingDraft(null)
    requestAi('AI draft from sources', () =>
      api.request<{ markdown: string }>(`/canvas/${canvasId}/draft`, { method: 'POST' }).then((r) => r.markdown)
    ).then((md) => {
      if (md) editorRef.current?.insertMarkdown(md)
      qc.invalidateQueries({ queryKey: ['canvas', canvasId] })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingDraftId, canvasId, Boolean(canvas.data)])

  if (!canvas.data) return <CircularProgress sx={{ m: 4 }} />
  const newCount = canvas.data.newSourceCount ?? 0

  return (
    <Box sx={{ flex: 1, overflow: 'auto', px: 4, py: 5 }}>
      <Box sx={{ maxWidth: 720, mx: 'auto' }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
          <Typography variant="h4">{canvas.data.title}</Typography>
          <Stack direction="row" spacing={1} alignItems="center">
            {newCount > 0 && (
              <Chip size="small" color="warning" variant="outlined" label={`${newCount} new source${newCount === 1 ? '' : 's'} · /llm can add ${newCount === 1 ? 'it' : 'them'}`} />
            )}
            <Button size="small" variant="outlined" startIcon={<FontAwesomeIcon icon={faArrowsRotate} />} onClick={regenerate} sx={{ textTransform: 'none' }}>
              Regenerate AI
            </Button>
          </Stack>
        </Stack>
        <Typography variant="caption" sx={{ opacity: 0.45, display: 'block', mb: 3 }}>
          Type <b>/llm</b> then your instruction to have AI write here from your sources.
        </Typography>

        <NoteEditor key={canvasId} ref={editorRef} doc={canvas.data.doc} onChange={(d) => save.mutate(d)} onCommand={runComplete} />
      </Box>

      <Dialog open={modal.open} onClose={() => closeWith('')} maxWidth="sm" fullWidth>
        <DialogTitle>{modal.title}</DialogTitle>
        <DialogContent dividers>
          {modal.loading ? (
            <Stack alignItems="center" sx={{ py: 5 }} spacing={1}>
              <CircularProgress />
              <Typography variant="body2" sx={{ opacity: 0.7 }}>Generating from your sources…</Typography>
            </Stack>
          ) : (
            <Box sx={{ '& a': { color: 'primary.light' }, '& pre': { p: 1, bgcolor: 'rgba(255,255,255,.06)', borderRadius: 1, overflow: 'auto' }, lineHeight: 1.6 }}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{modal.markdown}</ReactMarkdown>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => closeWith('')}>Cancel</Button>
          <Button variant="contained" disabled={modal.loading || !modal.markdown} onClick={() => closeWith(modal.markdown)}>
            Insert
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
