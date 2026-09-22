import React, { useRef, useState } from 'react'
import { Box, Typography, TextField, Button, Stack, Chip, Autocomplete, CircularProgress } from '@mui/material'
import { useQuery } from '@tanstack/react-query'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { api } from './engine.js'
import { proseSx } from './prose.js'

interface Capture {
  id: number
  source: { type?: string; url?: string; name?: string; uploadId?: string }
}
interface Citation {
  id: number
  source: { url?: string; name?: string }
}
interface Msg {
  role: 'user' | 'assistant'
  content: string
  citations?: Citation[]
}
interface DocOption {
  uploadId: string
  name: string
}

export const ChatView = (): React.ReactElement => {
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [docs, setDocs] = useState<DocOption[]>([])
  const [pending, setPending] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  const captures = useQuery({ queryKey: ['captures'], queryFn: () => api.request<Capture[]>('/capture') })
  // Distinct uploaded documents for the focus picker.
  const docOptions: DocOption[] = []
  const seen = new Set<string>()
  for (const c of captures.data ?? []) {
    const uid = c.source.uploadId
    if (c.source.type === 'upload' && uid && !seen.has(uid)) {
      seen.add(uid)
      docOptions.push({ uploadId: uid, name: c.source.name || 'Document' })
    }
  }

  const send = async (): Promise<void> => {
    const q = input.trim()
    if (!q || pending) return
    const next: Msg[] = [...messages, { role: 'user', content: q }]
    setMessages(next)
    setInput('')
    setPending(true)
    try {
      const res = await api.request<{ answer: string; citations: Citation[] }>('/chat', {
        method: 'POST',
        body: JSON.stringify({
          messages: next.map(({ role, content }) => ({ role, content })),
          docIds: docs.map((d) => d.uploadId)
        })
      })
      setMessages((m) => [...m, { role: 'assistant', content: res.answer, citations: res.citations }])
    } catch {
      setMessages((m) => [...m, { role: 'assistant', content: '⚠️ Something went wrong answering that.' }])
    } finally {
      setPending(false)
      setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), 0)
    }
  }

  return (
    <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100vh', maxWidth: 900, mx: 'auto', width: '100%' }}>
      <Box sx={{ px: 3, pt: 3, pb: 1 }}>
        <Typography variant="h4" sx={{ mb: 1 }}>Chat</Typography>
        <Autocomplete
          multiple
          size="small"
          options={docOptions}
          value={docs}
          onChange={(_e, v) => setDocs(v)}
          getOptionLabel={(o) => o.name}
          isOptionEqualToValue={(a, b) => a.uploadId === b.uploadId}
          renderInput={(p) => (
            <TextField {...p} placeholder={docs.length ? '' : 'Focus on documents (optional)…'} />
          )}
        />
      </Box>

      <Box sx={{ flex: 1, overflow: 'auto', px: 3 }}>
        {messages.length === 0 && (
          <Typography variant="body2" sx={{ opacity: 0.5, mt: 2 }}>
            Ask a question grounded in your captures and uploads. Follow-ups keep context.
          </Typography>
        )}
        {messages.map((m, i) => (
          <Box key={i} sx={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start', mb: 1.5 }}>
            <Box
              sx={{
                maxWidth: '85%',
                px: 1.5,
                py: 1,
                borderRadius: 2,
                bgcolor: m.role === 'user' ? 'primary.main' : 'background.paper',
                color: m.role === 'user' ? '#1b1917' : 'text.primary',
                border: m.role === 'user' ? 0 : 1,
                borderColor: 'divider'
              }}
            >
              {m.role === 'assistant' ? (
                <Box sx={proseSx}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                </Box>
              ) : (
                <Typography sx={{ whiteSpace: 'pre-wrap' }}>{m.content}</Typography>
              )}
              {m.citations && m.citations.length > 0 && (
                <Stack direction="row" spacing={0.5} sx={{ mt: 1, flexWrap: 'wrap' }}>
                  {m.citations.map((c) => (
                    <Chip key={c.id} size="small" label={c.source.name || c.source.url || `#${c.id}`} />
                  ))}
                </Stack>
              )}
            </Box>
          </Box>
        ))}
        {pending && (
          <Box sx={{ display: 'flex', justifyContent: 'flex-start', mb: 1.5 }}>
            <Box sx={{ px: 1.5, py: 1 }}>
              <CircularProgress size={18} />
            </Box>
          </Box>
        )}
        <div ref={endRef} />
      </Box>

      <Box sx={{ p: 3, display: 'flex', gap: 1 }}>
        <TextField
          fullWidth
          multiline
          maxRows={4}
          placeholder="Ask a follow-up…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              send()
            }
          }}
        />
        <Button variant="contained" onClick={send} disabled={pending || !input.trim()} sx={{ minWidth: 80 }}>
          Send
        </Button>
      </Box>
    </Box>
  )
}
