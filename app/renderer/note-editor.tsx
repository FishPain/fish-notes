import React, { useEffect, useRef } from 'react'
import { Box } from '@mui/material'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import { Markdown } from 'tiptap-markdown'
import { LlmPrompt } from './llm-prompt'
import { Provenance, isFullyAi } from './provenance'

export interface NoteEditorHandle {
  insertMarkdown: (md: string) => void
  replaceAiWith: (md: string) => void
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
      LlmPrompt.configure({ onRun: onCommand }),
      Provenance
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
      const from = editor.state.doc.content.size
      editor.chain().focus('end').insertContent(md).run()
      const to = editor.state.doc.content.size
      // Tag the inserted blocks as AI-authored (from-1 covers the case where the
      // first block merged into a trailing empty paragraph). Collapse selection too.
      editor.chain().markRangeAsAi(Math.max(1, from - 1), to).setTextSelection(to).run()
    },
    replaceAiWith: (md: string) => {
      if (!editor) return
      // Remove every top-level block that is wholly AI (human-edited blocks flipped
      // to null and are skipped), then drop the fresh draft where the first one was.
      const ranges: { from: number; to: number }[] = []
      editor.state.doc.forEach((node, offset) => {
        if (isFullyAi(node)) ranges.push({ from: offset, to: offset + node.nodeSize })
      })
      const insertAt = ranges.length ? ranges[0].from : editor.state.doc.content.size
      if (ranges.length) {
        let chain = editor.chain().focus()
        // Delete descending so earlier ranges' positions stay valid.
        for (let i = ranges.length - 1; i >= 0; i--) chain = chain.deleteRange(ranges[i])
        chain.run()
      }
      const from = Math.min(insertAt, editor.state.doc.content.size)
      editor.chain().focus().insertContentAt(from, md).run()
      const to = editor.state.selection.to
      editor.chain().markRangeAsAi(from, to).setTextSelection(to).run()
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
        '& .ProseMirror ::selection': { background: 'rgba(201,138,58,.28)' },
        // AI-authored blocks: a calm amber left bar (matches the /llm badge).
        '& .ProseMirror [data-origin="ai"]': { borderLeft: '2px solid', borderColor: 'primary.main', pl: 1.5 }
      }}
    >
      <EditorContent editor={editor} />
    </Box>
  )
})
NoteEditor.displayName = 'NoteEditor'
