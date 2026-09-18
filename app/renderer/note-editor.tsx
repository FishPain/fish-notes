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
  { doc: unknown; onChange: (doc: unknown) => void; onCommand: (prompt: string) => Promise<string> }
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
      editor?.chain().focus('end').insertContent(md).run()
    }
  }))

  return (
    <Box
      sx={{
        '& .ProseMirror': { outline: 'none', minHeight: 300, lineHeight: 1.7 },
        '& .ProseMirror a': { color: 'primary.light', cursor: 'pointer' }
      }}
    >
      <EditorContent editor={editor} />
    </Box>
  )
})
NoteEditor.displayName = 'NoteEditor'
