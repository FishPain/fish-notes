import React, { useState } from 'react'
import { Box, List, ListItem, ListItemButton, ListItemText, Typography, TextField, Button, IconButton, Stack, FormControlLabel, Checkbox, Popover } from '@mui/material'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faPlus, faLayerGroup, faTrash, faGear, faComments } from '@fortawesome/free-solid-svg-icons'
import { useUi } from './store.js'
import { api } from './main.js'
import { SettingsDialog } from './settings-dialog.js'

interface CanvasSummary {
  id: number
  title: string
}

export const CanvasList = (): React.ReactElement => {
  const { view, selectedCanvasId, openSearch, openChat, openCanvas, setPendingDraft } = useUi()
  const qc = useQueryClient()
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
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

  const remove = useMutation({
    mutationFn: (id: number) => api.request<void>(`/canvas/${id}`, { method: 'DELETE' }),
    onSuccess: (_r, id) => {
      qc.invalidateQueries({ queryKey: ['canvases'] })
      if (view === 'canvas' && selectedCanvasId === id) openSearch()
    }
  })

  const submit = (): void => {
    if (title.trim()) create.mutate({ title: title.trim(), description: description.trim() })
  }

  const confirmDelete = (id: number, name: string): void => {
    if (window.confirm(`Delete "${name}"? This can't be undone.`)) remove.mutate(id)
  }

  return (
    <Box sx={{ width: 250, bgcolor: 'background.paper', borderRight: 1, borderColor: 'divider', p: 1.5, height: '100vh', overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
      <ListItemButton selected={view === 'search'} onClick={openSearch} sx={{ borderRadius: 2, flexGrow: 0 }}>
        <FontAwesomeIcon icon={faLayerGroup} style={{ opacity: 0.7 }} />
        <ListItemText primary="Sources" sx={{ ml: 1.5 }} />
      </ListItemButton>
      <ListItemButton selected={view === 'chat'} onClick={openChat} sx={{ borderRadius: 2, mb: 1.5, flexGrow: 0 }}>
        <FontAwesomeIcon icon={faComments} style={{ opacity: 0.7 }} />
        <ListItemText primary="Chat" sx={{ ml: 1.5 }} />
      </ListItemButton>

      <Typography variant="overline" sx={{ opacity: 0.5, px: 1 }}>Notes</Typography>
      <List dense sx={{ flex: 1 }}>
        {(canvases.data || []).map((c) => (
          <ListItem
            key={c.id}
            disablePadding
            sx={{ '&:hover .del': { opacity: 0.7 } }}
            secondaryAction={
              <IconButton
                edge="end"
                size="small"
                aria-label="delete note"
                className="del"
                onClick={() => confirmDelete(c.id, c.title)}
                sx={{ opacity: 0, transition: 'opacity .15s' }}
              >
                <FontAwesomeIcon icon={faTrash} style={{ fontSize: 13 }} />
              </IconButton>
            }
          >
            <ListItemButton
              selected={view === 'canvas' && selectedCanvasId === c.id}
              onClick={() => openCanvas(c.id)}
              sx={{ borderRadius: 2, pr: 5 }}
            >
              <ListItemText primary={c.title} primaryTypographyProps={{ noWrap: true }} />
            </ListItemButton>
          </ListItem>
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

      <ListItemButton onClick={() => setSettingsOpen(true)} sx={{ borderRadius: 2, mt: 1, flexGrow: 0 }}>
        <FontAwesomeIcon icon={faGear} style={{ opacity: 0.7 }} />
        <ListItemText primary="Settings" sx={{ ml: 1.5 }} />
      </ListItemButton>

      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      <Popover
        open={Boolean(anchor)}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        transformOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        slotProps={{ paper: { sx: { borderRadius: 3, width: 360, border: 1, borderColor: 'divider', boxShadow: 8 } } }}
      >
        <Box sx={{ p: 2.5 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>New note</Typography>
          <Stack spacing={2}>
            <TextField
              size="small"
              fullWidth
              autoFocus
              label="Title"
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
              label="Description"
              placeholder="What is this note about?"
              helperText="Optional — helps AI pull in the right sources"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            <FormControlLabel
              sx={{ alignItems: 'flex-start', ml: 0 }}
              control={<Checkbox size="small" sx={{ pt: 0 }} checked={draftOnCreate} onChange={(e) => setDraftOnCreate(e.target.checked)} />}
              label={
                <Box>
                  <Typography variant="body2">Draft from sources</Typography>
                  <Typography variant="caption" sx={{ opacity: 0.6 }}>
                    AI writes a first draft from your captured sources
                  </Typography>
                </Box>
              }
            />
            <Stack direction="row" spacing={1} justifyContent="flex-end">
              <Button onClick={() => setAnchor(null)} sx={{ textTransform: 'none' }}>Cancel</Button>
              <Button
                variant="contained"
                disableElevation
                disabled={!title.trim() || create.isPending}
                onClick={submit}
                sx={{ textTransform: 'none', fontWeight: 600 }}
              >
                {create.isPending ? 'Creating…' : 'Create'}
              </Button>
            </Stack>
          </Stack>
        </Box>
      </Popover>
    </Box>
  )
}
