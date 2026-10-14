import React, { useEffect, useState } from 'react'
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, Autocomplete, Stack, Typography, Alert, Divider
} from '@mui/material'
import { AiSettings } from './main.js'

const EMPTY: AiSettings = { baseUrl: '', apiKey: '', chatModel: '', ocrModel: '', retrievalK: 12, captureShortcut: '' }

export const SettingsDialog = ({ open, onClose }: { open: boolean; onClose: () => void }): React.ReactElement => {
  const [cfg, setCfg] = useState<AiSettings>(EMPTY)
  const [models, setModels] = useState<string[]>([])
  const [test, setTest] = useState<{ ok: boolean; count?: number; status?: number } | null>(null)
  const [testing, setTesting] = useState(false)
  const [saved, setSaved] = useState(false)
  const [update, setUpdate] = useState<Awaited<ReturnType<typeof window.updates.check>> | null>(null)
  const [checking, setChecking] = useState(false)
  const [dl, setDl] = useState<'idle' | 'downloading' | 'opened' | 'error'>('idle')

  // Load config when opened, then quietly fetch the model list to fill the dropdowns.
  useEffect(() => {
    if (!open) return
    setTest(null)
    setSaved(false)
    setUpdate(null)
    setDl('idle')
    window.settings.get().then(async (c) => {
      setCfg(c)
      const r = await window.settings.test(c.baseUrl, c.apiKey)
      setModels(r.models ?? [])
    })
  }, [open])

  const set = <K extends keyof AiSettings>(k: K, v: AiSettings[K]): void => setCfg((c) => ({ ...c, [k]: v }))

  const runTest = async (): Promise<void> => {
    setTesting(true)
    const r = await window.settings.test(cfg.baseUrl, cfg.apiKey)
    setModels(r.models ?? [])
    setTest(r)
    setTesting(false)
  }

  const save = async (): Promise<void> => {
    await window.settings.save(cfg)
    setSaved(true)
  }

  const checkUpdates = async (): Promise<void> => {
    setChecking(true)
    setDl('idle')
    setUpdate(await window.updates.check())
    setChecking(false)
  }

  const downloadUpdate = async (): Promise<void> => {
    if (!update?.dmgUrl) return
    setDl('downloading')
    const r = await window.updates.download(update.dmgUrl)
    setDl(r.ok ? 'opened' : 'error')
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Settings</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          <Typography variant="body2" sx={{ opacity: 0.6 }}>
            AI runs through an OpenAI-compatible proxy. Stored locally on this machine; the API key is never bundled into the app.
          </Typography>
          <TextField label="Proxy base URL" size="small" fullWidth value={cfg.baseUrl} onChange={(e) => set('baseUrl', e.target.value)} placeholder="http://localhost:6655/openai/v1" />
          <TextField label="API key" size="small" fullWidth type="password" value={cfg.apiKey} onChange={(e) => set('apiKey', e.target.value)} />

          <Autocomplete
            freeSolo
            options={models}
            value={cfg.chatModel}
            onInputChange={(_e, v) => set('chatModel', v)}
            renderInput={(p) => <TextField {...p} label="Chat model" size="small" helperText="Ask + note drafting/completion" />}
          />
          <Autocomplete
            freeSolo
            options={models}
            value={cfg.ocrModel}
            onInputChange={(_e, v) => set('ocrModel', v)}
            renderInput={(p) => <TextField {...p} label="OCR model" size="small" helperText="Vision model for screen-capture OCR" />}
          />

          <Divider />

          <TextField
            label="Sources per answer (top-K)"
            size="small"
            type="number"
            value={cfg.retrievalK}
            onChange={(e) => set('retrievalK', Number(e.target.value))}
            helperText="How many captures ground Ask / draft / /llm"
            inputProps={{ min: 1, max: 50 }}
          />
          <TextField
            label="Capture shortcut"
            size="small"
            value={cfg.captureShortcut}
            onChange={(e) => set('captureShortcut', e.target.value)}
            helperText="Global hotkey for screen capture, e.g. CommandOrControl+Shift+9"
          />

          <Button variant="outlined" onClick={() => window.settings.openDataDir()} sx={{ alignSelf: 'flex-start', textTransform: 'none' }}>
            Open data folder
          </Button>

          <Divider />
          <Stack spacing={1}>
            <Button variant="outlined" onClick={checkUpdates} disabled={checking} sx={{ alignSelf: 'flex-start', textTransform: 'none' }}>
              {checking ? 'Checking…' : 'Check for updates'}
            </Button>
            {update && !update.hasUpdate && (
              <Typography variant="caption" sx={{ opacity: 0.7 }}>
                {update.latest ? `You're on the latest version (v${update.current}).` : "Couldn't check right now — try again later."}
              </Typography>
            )}
            {update?.hasUpdate && update.dmgUrl && (
              <Alert
                severity="info"
                action={
                  <Button color="inherit" size="small" onClick={downloadUpdate} disabled={dl === 'downloading'}>
                    {dl === 'downloading' ? 'Downloading…' : 'Download'}
                  </Button>
                }
              >
                Update available: v{update.latest} (you have v{update.current}).
              </Alert>
            )}
            {dl === 'opened' && (
              <Alert severity="success">Installer opened — drag Fish Notes to Applications, then reopen. First launch: right-click → Open.</Alert>
            )}
            {dl === 'error' && <Alert severity="error">Download failed — try again later.</Alert>}
          </Stack>

          {test && (
            <Alert severity={test.ok ? 'success' : 'error'}>
              {test.ok ? `Connected — ${test.count} models available` : `Failed${test.status ? ` (HTTP ${test.status})` : ' to reach the proxy'}`}
            </Alert>
          )}
          {saved && (
            <Alert severity="info" action={<Button color="inherit" size="small" onClick={() => window.settings.relaunch()}>Restart now</Button>}>
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
