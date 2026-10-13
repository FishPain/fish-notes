import React, { useEffect, useRef, useState } from 'react'
import {
  Box, Typography, TextField, Button, Stack, Chip, CircularProgress, MenuItem, Popover, Popper, Paper
} from '@mui/material'
import { useQuery, useQueryClient } from '@tanstack/react-query'
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
  content: string
  source: { type?: string; url?: string; name?: string; appName?: string; windowTitle?: string }
}

// A short identity for a citation chip: doc name, app/title, URL host, else #id.
const citationLabel = (c: Citation): string => {
  if (c.source.name) return c.source.name
  const appTitle = [c.source.appName, c.source.windowTitle].filter(Boolean).join(' — ')
  if (appTitle) return appTitle
  if (c.source.url) {
    try {
      return new URL(c.source.url).hostname
    } catch {
      return c.source.url
    }
  }
  return `#${c.id}`
}

// Clickable citation chip: click opens a popover showing which source it is (app/title),
// the cited text, and a jump-to-source link when the capture has a URL.
const CitationChip = ({ c }: { c: Citation }): React.ReactElement => {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const appTitle = [c.source.appName, c.source.windowTitle].filter(Boolean).join(' — ')
  return (
    <>
      <Chip size="small" label={citationLabel(c)} onClick={(e) => setAnchor(e.currentTarget)} sx={{ cursor: 'pointer' }} />
      <Popover
        open={!!anchor}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      >
        <Box sx={{ p: 1.5, maxWidth: 380 }}>
          {appTitle && (
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 0.5 }}>
              🖥 {appTitle}
            </Typography>
          )}
          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', maxHeight: 220, overflow: 'auto' }}>
            {c.content}
          </Typography>
          {c.source.url && (
            <Typography
              variant="caption"
              component="a"
              href={c.source.url}
              target="_blank"
              rel="noreferrer"
              sx={{ color: 'text.secondary', display: 'block', mt: 1 }}
            >
              jump to source
            </Typography>
          )}
        </Box>
      </Popover>
    </>
  )
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
  const { selectedChatId, selectChat, pendingChatQuestion, clearPendingChatQuestion } = useUi()
  const qc = useQueryClient()
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [docs, setDocs] = useState<DocOption[]>([])
  const [pending, setPending] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLDivElement>(null)

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

  const send = async (text?: string): Promise<void> => {
    const q = (text ?? input).trim()
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

  // @-mention: a trailing "@token" in the input opens a doc picker. ponytail: anchored
  // to the end of the input, not caret-aware — fine for a chat box; upgrade to caret
  // tracking if mid-sentence mentions are ever needed.
  const mentionQuery = input.match(/@([^@\s]*)$/)?.[1] ?? null
  const mentionOptions =
    mentionQuery == null
      ? []
      : docOptions.filter(
          (o) => !docs.some((d) => d.uploadId === o.uploadId) && o.name.toLowerCase().includes(mentionQuery.toLowerCase())
        )
  const addDoc = (o: DocOption): void => {
    setDocs((d) => [...d, o])
    setInput((t) => t.replace(/@([^@\s]*)$/, ''))
  }
  const removeDoc = (uid: string): void => setDocs((d) => d.filter((x) => x.uploadId !== uid))

  // Seeded from Sources' Ask: send the question once, into this fresh conversation.
  useEffect(() => {
    if (pendingChatQuestion) {
      const q = pendingChatQuestion
      clearPendingChatQuestion()
      send(q)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingChatQuestion])

  return (
    <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100vh', maxWidth: 900, mx: 'auto', width: '100%' }}>
      <Box sx={{ px: 3, pt: 3, pb: 1 }}>
        <Typography variant="h4" noWrap>
          {selectedChatId != null ? conversations.data?.find((c) => c.id === selectedChatId)?.title || 'Chat' : 'New chat'}
        </Typography>
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
                    <CitationChip key={c.id} c={c} />
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

      <Box sx={{ p: 3 }}>
        {docs.length > 0 && (
          <Stack direction="row" spacing={0.5} sx={{ mb: 1, flexWrap: 'wrap' }}>
            {docs.map((d) => (
              <Chip key={d.uploadId} size="small" label={`📄 ${d.name}`} onDelete={() => removeDoc(d.uploadId)} />
            ))}
          </Stack>
        )}
        <Box ref={inputRef} sx={{ display: 'flex', gap: 1 }}>
          <TextField
            fullWidth
            multiline
            maxRows={4}
            placeholder="Ask a follow-up…  (@ to focus on a document)"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              // While the @-mention list is open, Enter is handled by the picker, not send.
              if (e.key === 'Enter' && !e.shiftKey && mentionOptions.length === 0) {
                e.preventDefault()
                send()
              }
            }}
          />
          <Button variant="contained" onClick={() => send()} disabled={pending || !input.trim()} sx={{ minWidth: 80 }}>
            Send
          </Button>
        </Box>
        <Popper open={mentionOptions.length > 0} anchorEl={inputRef.current} placement="top-start" style={{ zIndex: 1300 }}>
          <Paper sx={{ width: 320, maxHeight: 240, overflow: 'auto', border: 1, borderColor: 'divider' }}>
            {mentionOptions.map((o) => (
              <MenuItem key={o.uploadId} onClick={() => addDoc(o)}>
                📄 {o.name}
              </MenuItem>
            ))}
          </Paper>
        </Popper>
      </Box>
    </Box>
  )
}
