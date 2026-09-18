import React, { useState } from 'react'
import { Box, List, ListItemButton, ListItemText, Typography, TextField, IconButton, Stack } from '@mui/material'
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
  const { view, selectedCanvasId, openSearch, openCanvas } = useUi()
  const qc = useQueryClient()
  const [title, setTitle] = useState('')

  const canvases = useQuery({
    queryKey: ['canvases'],
    queryFn: () => api.request<CanvasSummary[]>('/canvas')
  })

  const create = useMutation({
    mutationFn: (t: string) => api.request<{ id: number }>('/canvas', { method: 'POST', body: JSON.stringify({ title: t }) }),
    onSuccess: (res) => {
      setTitle('')
      qc.invalidateQueries({ queryKey: ['canvases'] })
      openCanvas(res.id)
    }
  })

  return (
    <Box sx={{ width: 240, borderRight: 1, borderColor: 'divider', p: 1.5, height: '100vh', overflow: 'auto' }}>
      <ListItemButton selected={view === 'search'} onClick={openSearch} sx={{ borderRadius: 1, mb: 1 }}>
        <FontAwesomeIcon icon={faMagnifyingGlass} />
        <ListItemText primary="Search" sx={{ ml: 1 }} />
      </ListItemButton>

      <Typography variant="overline" sx={{ opacity: 0.6 }}>Canvases</Typography>
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

      <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
        <TextField
          size="small"
          fullWidth
          placeholder="New canvas…"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && title.trim()) create.mutate(title.trim())
          }}
        />
        <IconButton disabled={!title.trim()} onClick={() => create.mutate(title.trim())}>
          <FontAwesomeIcon icon={faPlus} />
        </IconButton>
      </Stack>
    </Box>
  )
}
