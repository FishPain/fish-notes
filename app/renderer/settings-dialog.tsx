import React, { useEffect, useState } from 'react'
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, Stack, Typography, Alert
} from '@mui/material'
import { AiSettings } from './main.js'

const EMPTY: AiSettings = { baseUrl: '', apiKey: '', chatModel: '', ocrModel: '' }

export const SettingsDialog = ({ open, onClose }: { open: boolean; onClose: () => void }): React.ReactElement => {
  const [cfg, setCfg] = useState<AiSettings>(EMPTY)
  const [test, setTest] = useState<{ ok: boolean; count?: number; status?: number } | null>(null)
  const [testing, setTesting] = useState(false)
  const [saved, setSaved] = useState(false)

  // Load effective config each time the dialog opens.
  useEffect(() => {
    if (open) {
      setTest(null)
      setSaved(false)
      window.settings.get().then(setCfg)
    }
  }, [open])

  const set = (k: keyof AiSettings) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setCfg((c) => ({ ...c, [k]: e.target.value }))

  const runTest = async (): Promise<void> => {
    setTesting(true)
    setTest(await window.settings.test(cfg.baseUrl, cfg.apiKey))
    setTesting(false)
  }

  const save = async (): Promise<void> => {
    await window.settings.save(cfg)
    setSaved(true)
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Settings</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          <Typography variant="body2" sx={{ opacity: 0.6 }}>
            AI runs through an OpenAI-compatible proxy. Stored locally on this machine; the API key is never bundled into the app.
          </Typography>
          <TextField label="Proxy base URL" size="small" fullWidth value={cfg.baseUrl} onChange={set('baseUrl')} placeholder="http://localhost:6655/openai/v1" />
          <TextField label="API key" size="small" fullWidth type="password" value={cfg.apiKey} onChange={set('apiKey')} />
          <TextField label="Chat model" size="small" fullWidth value={cfg.chatModel} onChange={set('chatModel')} helperText="Used for Ask + note drafting/completion" />
          <TextField label="OCR model" size="small" fullWidth value={cfg.ocrModel} onChange={set('ocrModel')} helperText="Vision model for screen-capture OCR" />

          {test && (
            <Alert severity={test.ok ? 'success' : 'error'}>
              {test.ok ? `Connected — ${test.count} models available` : `Failed${test.status ? ` (HTTP ${test.status})` : ' to reach the proxy'}`}
            </Alert>
          )}
          {saved && (
            <Alert
              severity="info"
              action={<Button color="inherit" size="small" onClick={() => window.settings.relaunch()}>Restart now</Button>}
            >
              Saved — restart to apply.
            </Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={runTest} disabled={testing}>{testing ? 'Testing…' : 'Test connection'}</Button>
        <Button onClick={onClose}>Close</Button>
        <Button variant="contained" onClick={save}>Save</Button>
      </DialogActions>
    </Dialog>
  )
}
