import React, { useEffect, useRef } from 'react'
import { Box } from '@mui/material'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import { marked } from 'marked'

export interface NoteEditorHandle {
  insertMarkdown: (md: string) => void
}

// If the cursor's block is a `/llm <prompt>` command, return the prompt.
const readSlashCommand = (line: string): string | null => {
  const m = line.match(/^\/llm\s+(.+)$/)
  return m ? m[1].trim() : null
}

export const NoteEditor = React.forwardRef<
  NoteEditorHandle,
  { doc: unknown; onChange: (doc: unknown) => void; onCommand: (prompt: string) => Promise<string> }
>(({ doc, onChange, onCommand }, ref) => {
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const editor = useEditor({
    extensions: [StarterKit, Link.configure({ openOnClick: true, autolink: true })],
    content: (doc as object) || { type: 'doc', content: [] },
    onUpdate: ({ editor }) => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => onChange(editor.getJSON()), 800)
    },
    editorProps: {
      handleKeyDown: (view, event) => {
        if (event.key !== 'Enter') return false
        const { $from } = view.state.selection
        const prompt = readSlashCommand($from.parent.textContent)
        if (!prompt) return false
        event.preventDefault()
        const start = $from.start()
        const end = $from.end()
        onCommand(prompt).then((md) => {
          if (!editor) return
          editor
            .chain()
            .focus()
            .deleteRange({ from: start, to: end })
            .insertContent(marked.parse(md, { async: false }) as string)
            .run()
        })
        return true
      }
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
      editor?.chain().focus('end').insertContent(marked.parse(md, { async: false }) as string).run()
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
