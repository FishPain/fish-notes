import React, { useEffect, useRef, useState } from 'react'
import {
  Box, Typography, TextField, Button, Stack, Chip, Autocomplete, CircularProgress, Select, MenuItem, IconButton
} from '@mui/material'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faPlus, faTrash } from '@fortawesome/free-solid-svg-icons'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useUi } from './store.js'
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
interface Conversation {
  id: number
  title: string
  messages: Msg[]
  docIds: string[]
}

export const ChatView = (): React.ReactElement => {
  const { selectedChatId, newChat, selectChat } = useUi()
  const qc = useQueryClient()
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [docs, setDocs] = useState<DocOption[]>([])
  const [pending, setPending] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  const captures = useQuery({ queryKey: ['captures'], queryFn: () => api.request<Capture[]>('/capture') })
  const conversations = useQuery({
    queryKey: ['chats'],
    queryFn: () => api.request<{ id: number; title: string }[]>('/chats')
  })
  const current = useQuery({
    queryKey: ['chat-convo', selectedChatId],
    queryFn: () => api.request<Conversation>(`/chats/${selectedChatId}`),
    enabled: selectedChatId != null
  })

  const docOptions: DocOption[] = []
  const seen = new Set<string>()
  for (const c of captures.data ?? []) {
    const uid = c.source.uploadId
    if (c.source.type === 'upload' && uid && !seen.has(uid)) {
      seen.add(uid)
      docOptions.push({ uploadId: uid, name: c.source.name || 'Document' })
    }
  }

  // Hydrate the thread from the selected conversation (or clear for a new chat).
  useEffect(() => {
    if (selectedChatId == null) {
      setMessages([])
      setDocs([])
    } else if (current.data) {
      setMessages(current.data.messages ?? [])
      setDocs(docOptions.filter((o) => current.data!.docIds.includes(o.uploadId)))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedChatId, current.data])

  const persist = async (msgs: Msg[]): Promise<void> => {
    const docIds = docs.map((d) => d.uploadId)
    if (selectedChatId == null) {
      const title = (msgs.find((m) => m.role === 'user')?.content ?? 'New chat').slice(0, 60)
      const { id } = await api.request<{ id: number }>('/chats', {
        method: 'POST',
        body: JSON.stringify({ title, messages: msgs, docIds })
      })
      selectChat(id)
    } else {
      await api.request(`/chats/${selectedChatId}`, { method: 'PATCH', body: JSON.stringify({ messages: msgs, docIds }) })
    }
    qc.invalidateQueries({ queryKey: ['chats'] })
  }

  const send = async (): Promise<void> => {
    const q = input.trim()
    if (!q || pending) return
    const withUser: Msg[] = [...messages, { role: 'user', content: q }]
    setMessages(withUser)
    setInput('')
    setPending(true)
    try {
      const res = await api.request<{ answer: string; citations: Citation[] }>('/chat', {
        method: 'POST',
        body: JSON.stringify({
          messages: withUser.map(({ role, content }) => ({ role, content })),
          docIds: docs.map((d) => d.uploadId)
        })
      })
      const withAnswer: Msg[] = [...withUser, { role: 'assistant', content: res.answer, citations: res.citations }]
      setMessages(withAnswer)
      await persist(withAnswer)
    } catch {
      setMessages((m) => [...m, { role: 'assistant', content: '⚠️ Something went wrong answering that.' }])
    } finally {
      setPending(false)
      setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), 0)
    }
  }

  const deleteCurrent = async (): Promise<void> => {
    if (selectedChatId == null || !window.confirm('Delete this conversation?')) return
    await api.request(`/chats/${selectedChatId}`, { method: 'DELETE' })
    qc.invalidateQueries({ queryKey: ['chats'] })
    newChat()
  }

  return (
    <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100vh', maxWidth: 900, mx: 'auto', width: '100%' }}>
      <Box sx={{ px: 3, pt: 3, pb: 1 }}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
          <Typography variant="h4" sx={{ flex: 1 }}>Chat</Typography>
          <Select
            size="small"
            displayEmpty
            value={selectedChatId ?? ''}
            onChange={(e) => selectChat(Number(e.target.value))}
            sx={{ minWidth: 200 }}
          >
            <MenuItem value="" disabled>
              {conversations.data?.length ? 'History…' : 'No saved chats'}
            </MenuItem>
            {(conversations.data ?? []).map((c) => (
              <MenuItem key={c.id} value={c.id}>{c.title || 'Untitled'}</MenuItem>
            ))}
          </Select>
          <Button size="small" variant="outlined" startIcon={<FontAwesomeIcon icon={faPlus} />} onClick={newChat} sx={{ textTransform: 'none' }}>
            New
          </Button>
          {selectedChatId != null && (
            <IconButton size="small" aria-label="delete conversation" onClick={deleteCurrent}>
              <FontAwesomeIcon icon={faTrash} style={{ fontSize: 14 }} />
            </IconButton>
          )}
        </Stack>
        <Autocomplete
          multiple
          size="small"
          options={docOptions}
          value={docs}
          onChange={(_e, v) => setDocs(v)}
          getOptionLabel={(o) => o.name}
          isOptionEqualToValue={(a, b) => a.uploadId === b.uploadId}
          renderInput={(p) => <TextField {...p} placeholder={docs.length ? '' : 'Focus on documents (optional)…'} />}
        />
      </Box>

      <Box sx={{ flex: 1, overflow: 'auto', px: 3 }}>
        {messages.length === 0 && (
          <Typography variant="body2" sx={{ opacity: 0.5, mt: 2 }}>
            Ask a question grounded in your captures and uploads. Follow-ups keep context; conversations are saved.
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
