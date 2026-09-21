import React, { useEffect, useRef } from 'react'
import { Box } from '@mui/material'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import { Markdown } from 'tiptap-markdown'
import { LlmPrompt } from './llm-prompt'

export interface NoteEditorHandle {
  insertMarkdown: (md: string) => void
}

export const NoteEditor = React.forwardRef<
  NoteEditorHandle,
  { doc: unknown; onChange: (doc: unknown) => void; onCommand: (prompt: string, context: string) => Promise<string> }
>(({ doc, onChange, onCommand }, ref) => {
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({ openOnClick: true, autolink: true }),
      Markdown.configure({ html: false, linkify: true }),
      LlmPrompt.configure({ onRun: onCommand })
    ],
    content: (doc as object) || { type: 'doc', content: [] },
    onUpdate: ({ editor }) => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => onChange(editor.getJSON()), 800)
    }
  })

  useEffect(() => {
    if (!editor) return
    const el = editor.view.dom
    const onClick = (e: MouseEvent): void => {
      const a = (e.target as HTMLElement).closest('a') as HTMLAnchorElement | null
      if (a?.href) {
        e.preventDefault()
        window.open(a.href, '_blank')
      }
    }
    el.addEventListener('click', onClick)
    return () => el.removeEventListener('click', onClick)
  }, [editor])

  React.useImperativeHandle(ref, () => ({
    insertMarkdown: (md: string) => {
      if (!editor) return
      editor.chain().focus('end').insertContent(md).run()
      // Collapse the selection so the freshly inserted text isn't left highlighted.
      editor.commands.setTextSelection(editor.state.doc.content.size)
    }
  }))

  const serif = "'Iowan Old Style', 'Palatino', Georgia, serif"
  return (
    <Box
      sx={{
        '& .ProseMirror': { outline: 'none', minHeight: 300, lineHeight: 1.75, fontSize: '1.02rem' },
        '& .ProseMirror h1, & .ProseMirror h2, & .ProseMirror h3': { fontFamily: serif, fontWeight: 600, color: 'text.primary', lineHeight: 1.3 },
        '& .ProseMirror h1': { fontSize: '1.6rem', mt: 3, mb: 1 },
        '& .ProseMirror h2': { fontSize: '1.3rem', mt: 2.5, mb: 0.75 },
        '& .ProseMirror h3': { fontSize: '1.1rem', mt: 2, mb: 0.5 },
        '& .ProseMirror p': { my: 1 },
        '& .ProseMirror ul, & .ProseMirror ol': { pl: 3, my: 1 },
        '& .ProseMirror li': { my: 0.25 },
        '& .ProseMirror blockquote': { borderLeft: '3px solid', borderColor: 'primary.main', pl: 2, ml: 0, opacity: 0.85, fontStyle: 'italic' },
        '& .ProseMirror pre': { bgcolor: 'rgba(255,255,255,.05)', p: 1.5, borderRadius: 1, overflow: 'auto' },
        '& .ProseMirror code': { bgcolor: 'rgba(255,255,255,.06)', px: 0.5, borderRadius: 0.5, fontSize: '.9em' },
        '& .ProseMirror a': { color: 'primary.light', cursor: 'pointer' },
        '& .ProseMirror ::selection': { background: 'rgba(201,138,58,.28)' }
      }}
    >
      <EditorContent editor={editor} />
    </Box>
  )
})
NoteEditor.displayName = 'NoteEditor'
