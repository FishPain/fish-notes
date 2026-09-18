import React, { useEffect, useRef } from 'react'
import { Box } from '@mui/material'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { AiOrigin, Citation } from './editor-marks.js'

interface Capture {
  id: number
  source: { url?: string; anchor?: string }
}
interface Section {
  heading: string
  text: string
  citations: number[]
}

export interface NoteEditorHandle {
  insertSections: (sections: Section[]) => void
}

const openCitation = (captures: Map<number, Capture>, id: number): void => {
  const c = captures.get(id)
  if (c?.source.url) window.open(`${c.source.url}${c.source.anchor || ''}`, '_blank')
}

export const NoteEditor = React.forwardRef<
  NoteEditorHandle,
  { doc: unknown; captures: Map<number, Capture>; onChange: (doc: unknown) => void }
>(({ doc, captures, onChange }, ref) => {
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const editor = useEditor({
    extensions: [StarterKit, AiOrigin, Citation],
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
      const target = (e.target as HTMLElement).closest('sup.citation') as HTMLElement | null
      if (target) openCitation(captures, Number(target.getAttribute('data-capture-id')))
    }
    el.addEventListener('click', onClick)
    return () => el.removeEventListener('click', onClick)
  }, [editor, captures])

  React.useImperativeHandle(ref, () => ({
    insertSections: (sections: Section[]) => {
      if (!editor) return
      const chain = editor.chain().focus('end')
      for (const s of sections) {
        chain
          .insertContent({ type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: s.heading }] })
          .insertContent({
            type: 'paragraph',
            content: [
              { type: 'text', marks: [{ type: 'aiOrigin' }], text: s.text + ' ' },
              ...s.citations.map((id) => ({
                type: 'text',
                marks: [{ type: 'citation', attrs: { captureId: id } }],
                text: `[${id}]`
              }))
            ]
          })
      }
      chain.run()
    }
  }))

  return (
    <Box
      sx={{
        '& .ProseMirror': { outline: 'none', minHeight: 300, lineHeight: 1.7 },
        '& .ai-origin': { bgcolor: 'rgba(120,140,255,.10)' },
        '& sup.citation': { color: 'primary.light', cursor: 'pointer', ml: '2px' }
      }}
    >
      <EditorContent editor={editor} />
    </Box>
  )
})
NoteEditor.displayName = 'NoteEditor'
