import React, { useState } from 'react'
import { Box, List, ListItemButton, ListItemText, Typography, TextField, Button, Stack, FormControlLabel, Checkbox, Popover } from '@mui/material'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faPlus, faMagnifyingGlass } from '@fortawesome/free-solid-svg-icons'
import { useUi } from './store.js'
import { api } from './main.js'

interface CanvasSummary {
  id: number
  title: string
}

export const CanvasList = (): React.ReactElement => {
  const { view, selectedCanvasId, openSearch, openCanvas, setPendingDraft } = useUi()
  const qc = useQueryClient()
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [draftOnCreate, setDraftOnCreate] = useState(false)

  const canvases = useQuery({
    queryKey: ['canvases'],
    queryFn: () => api.request<CanvasSummary[]>('/canvas')
  })

  const create = useMutation({
    mutationFn: (body: { title: string; description: string }) =>
      api.request<{ id: number }>('/canvas', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: (res) => {
      setTitle('')
      setDescription('')
      setDraftOnCreate(false)
      setAnchor(null)
      qc.invalidateQueries({ queryKey: ['canvases'] })
      if (draftOnCreate) setPendingDraft(res.id)
      openCanvas(res.id)
    }
  })

  const submit = (): void => {
    if (title.trim()) create.mutate({ title: title.trim(), description: description.trim() })
  }

  return (
    <Box sx={{ width: 250, bgcolor: 'background.paper', borderRight: 1, borderColor: 'divider', p: 1.5, height: '100vh', overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
      <ListItemButton selected={view === 'search'} onClick={openSearch} sx={{ borderRadius: 2, mb: 1.5 }}>
        <FontAwesomeIcon icon={faMagnifyingGlass} style={{ opacity: 0.7 }} />
        <ListItemText primary="Search" sx={{ ml: 1.5 }} />
      </ListItemButton>

      <Typography variant="overline" sx={{ opacity: 0.5, px: 1 }}>Notes</Typography>
      <List dense sx={{ flex: 1 }}>
        {(canvases.data || []).map((c) => (
          <ListItemButton
            key={c.id}
            selected={view === 'canvas' && selectedCanvasId === c.id}
            onClick={() => openCanvas(c.id)}
            sx={{ borderRadius: 2 }}
          >
            <ListItemText primary={c.title} primaryTypographyProps={{ noWrap: true }} />
          </ListItemButton>
        ))}
      </List>

      <Button
        fullWidth
        variant="contained"
        startIcon={<FontAwesomeIcon icon={faPlus} />}
        onClick={(e) => setAnchor(e.currentTarget)}
        sx={{ mt: 1, textTransform: 'none', fontWeight: 600 }}
      >
        New note
      </Button>

      <Popover
        open={Boolean(anchor)}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        transformOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Stack spacing={1.5} sx={{ p: 2, width: 300 }}>
          <TextField
            size="small"
            fullWidth
            autoFocus
            placeholder="Note title…"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit()
            }}
          />
          <TextField
            size="small"
            fullWidth
            multiline
            minRows={2}
            placeholder="Description (optional) — helps group sources"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <FormControlLabel
            control={<Checkbox size="small" checked={draftOnCreate} onChange={(e) => setDraftOnCreate(e.target.checked)} />}
            label="Draft from sources"
          />
          <Button variant="contained" disabled={!title.trim()} onClick={submit} sx={{ textTransform: 'none' }}>
            Create note
          </Button>
        </Stack>
      </Popover>
    </Box>
  )
}
