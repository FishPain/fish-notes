import React, { useEffect, useState } from 'react'
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField } from '@mui/material'
import { useUi } from './store.js'

// Shown after every screen capture: confirm/correct the detected source and add an
// optional description before the screenshot is OCR'd + stored.
export const CaptureDialog = (): React.ReactElement | null => {
  const pending = useUi((s) => s.pendingCapture)
  const confirmCapture = useUi((s) => s.confirmCapture)
  const cancelCapture = useUi((s) => s.cancelCapture)

  const [url, setUrl] = useState('')
  const [appName, setAppName] = useState('')
  const [windowTitle, setWindowTitle] = useState('')
  const [note, setNote] = useState('')

  // Seed the fields from detection whenever a new capture opens the dialog.
  useEffect(() => {
    if (!pending) return
    setUrl(pending.url)
    setAppName(pending.appName)
    setWindowTitle(pending.windowTitle)
    setNote('')
  }, [pending])

  if (!pending) return null

  const save = (): void => void confirmCapture({ url, appName, windowTitle, note })

  return (
    <Dialog open onClose={cancelCapture} maxWidth="sm" fullWidth>
      <DialogTitle>Save screen capture</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Box
            component="img"
            src={`data:image/png;base64,${pending.pngBase64}`}
            alt="captured region"
            sx={{ display: 'block', maxHeight: 160, maxWidth: '100%', borderRadius: 1, border: 1, borderColor: 'divider' }}
          />
          <TextField label="URL" size="small" fullWidth value={url} onChange={(e) => setUrl(e.target.value)} />
          <TextField label="Source / app" size="small" fullWidth value={appName} onChange={(e) => setAppName(e.target.value)} />
          <TextField label="Window title" size="small" fullWidth value={windowTitle} onChange={(e) => setWindowTitle(e.target.value)} />
          <TextField label="Description (optional)" size="small" fullWidth multiline minRows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={cancelCapture}>Cancel</Button>
        <Button variant="contained" onClick={save}>Save</Button>
      </DialogActions>
    </Dialog>
  )
}
