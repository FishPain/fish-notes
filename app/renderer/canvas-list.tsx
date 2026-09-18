import React, { useState } from 'react'
import { Box, List, ListItemButton, ListItemText, Typography, TextField, IconButton, Stack, FormControlLabel, Checkbox } from '@mui/material'
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
      qc.invalidateQueries({ queryKey: ['canvases'] })
      if (draftOnCreate) setPendingDraft(res.id)
      openCanvas(res.id)
    }
  })

  const submit = (): void => {
    if (title.trim()) create.mutate({ title: title.trim(), description: description.trim() })
  }

  return (
    <Box sx={{ width: 240, borderRight: 1, borderColor: 'divider', p: 1.5, height: '100vh', overflow: 'auto' }}>
      <ListItemButton selected={view === 'search'} onClick={openSearch} sx={{ borderRadius: 1, mb: 1 }}>
        <FontAwesomeIcon icon={faMagnifyingGlass} />
        <ListItemText primary="Search" sx={{ ml: 1 }} />
      </ListItemButton>

      <Typography variant="overline" sx={{ opacity: 0.6 }}>Notes</Typography>
      <List dense>
        {(canvases.data || []).map((c) => (
          <ListItemButton
            key={c.id}
            selected={view === 'canvas' && selectedCanvasId === c.id}
            onClick={() => openCanvas(c.id)}
            sx={{ borderRadius: 1 }}
          >
            <ListItemText primary={c.title} />
          </ListItemButton>
        ))}
      </List>

      <Stack spacing={1} sx={{ mt: 1 }}>
        <TextField
          size="small"
          fullWidth
          placeholder="New note title…"
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
        <IconButton disabled={!title.trim()} onClick={submit} sx={{ alignSelf: 'flex-end' }}>
          <FontAwesomeIcon icon={faPlus} />
        </IconButton>
      </Stack>
    </Box>
  )
}
