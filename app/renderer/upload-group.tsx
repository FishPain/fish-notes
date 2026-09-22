import React, { useState } from 'react'
import { Card, CardContent, Stack, Typography, IconButton, Collapse, Box } from '@mui/material'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faTrash, faChevronRight, faChevronDown, faFileLines } from '@fortawesome/free-solid-svg-icons'
import { api } from './engine.js'

interface Chunk {
  id: number
  content: string
  source: { chunkIndex?: number }
}

// One row per uploaded document: name + chunk count, expandable, delete-whole-document.
export const UploadGroup = ({ uploadId, name, chunks }: { uploadId: string; name: string; chunks: Chunk[] }): React.ReactElement => {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const del = useMutation({
    mutationFn: () => api.request<void>(`/capture/upload/${uploadId}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['captures'] })
  })
  const sorted = [...chunks].sort((a, b) => (a.source.chunkIndex ?? 0) - (b.source.chunkIndex ?? 0))

  return (
    <Card sx={{ mb: 1 }}>
      <CardContent>
        <Stack direction="row" alignItems="center" spacing={1}>
          <IconButton size="small" onClick={() => setOpen((o) => !o)}>
            <FontAwesomeIcon icon={open ? faChevronDown : faChevronRight} style={{ fontSize: 12 }} />
          </IconButton>
          <FontAwesomeIcon icon={faFileLines} style={{ opacity: 0.7 }} />
          <Typography sx={{ flex: 1 }} noWrap>{name}</Typography>
          <Typography variant="caption" sx={{ opacity: 0.6 }}>{chunks.length} chunks</Typography>
          <IconButton
            size="small"
            aria-label="delete document"
            disabled={del.isPending}
            onClick={() => {
              if (window.confirm(`Delete "${name}" and its ${chunks.length} chunks?`)) del.mutate()
            }}
          >
            <FontAwesomeIcon icon={faTrash} style={{ fontSize: 13 }} />
          </IconButton>
        </Stack>
        <Collapse in={open}>
          <Box sx={{ mt: 1, pl: 4 }}>
            {sorted.map((c) => (
              <Typography key={c.id} variant="body2" sx={{ opacity: 0.75, mb: 1, whiteSpace: 'pre-wrap' }}>
                {c.content.slice(0, 400)}
                {c.content.length > 400 ? '…' : ''}
              </Typography>
            ))}
          </Box>
        </Collapse>
      </CardContent>
    </Card>
  )
}
