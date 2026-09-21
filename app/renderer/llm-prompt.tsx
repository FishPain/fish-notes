import React, { useEffect, useRef, useState } from 'react'
import { Node, mergeAttributes, InputRule } from '@tiptap/core'
import { ReactNodeViewRenderer, NodeViewWrapper, NodeViewProps } from '@tiptap/react'

export interface LlmPromptOptions {
  onRun: (instruction: string) => Promise<string>
}

const Badge = (props: NodeViewProps): React.ReactElement => {
  const { editor, node, getPos, extension } = props
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // ProseMirror keeps DOM focus on the doc right after inserting the node, so
  // autoFocus loses the race. Grab focus once the editor has settled.
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 0)
    return () => clearTimeout(t)
  }, [])

  const removeSelf = (): void => {
    const pos = getPos()
    if (typeof pos !== 'number') return
    editor.chain().focus().deleteRange({ from: pos, to: pos + node.nodeSize }).run()
  }

  const run = async (): Promise<void> => {
    const instruction = value.trim()
    if (!instruction) return removeSelf()
    setBusy(true)
    const md = await (extension.options as LlmPromptOptions).onRun(instruction)
    const pos = getPos()
    if (typeof pos !== 'number') return
    if (md) {
      editor.chain().focus().insertContentAt({ from: pos, to: pos + node.nodeSize }, md).run()
      // Collapse the selected range (insertContentAt leaves it selected — the "blue block").
      editor.commands.setTextSelection(editor.state.selection.to)
    } else {
      removeSelf()
    }
  }

  return (
    <NodeViewWrapper
      as="div"
      contentEditable={false}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '3px 10px',
        margin: '4px 0',
        borderRadius: 999,
        background: 'rgba(201,138,58,.16)',
        border: '1px solid rgba(201,138,58,.5)'
      }}
    >
      <span style={{ fontSize: 12, fontWeight: 600, color: '#d9a05a' }}>/llm</span>
      <input
        ref={inputRef}
        disabled={busy}
        placeholder="Ask AI to write here…"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => {
          if (!busy && !value.trim()) removeSelf()
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            run()
          } else if (e.key === 'Escape') {
            e.preventDefault()
            removeSelf()
          } else if (e.key === 'Backspace' && !value) {
            e.preventDefault()
            removeSelf()
          }
        }}
        style={{
          border: 'none',
          outline: 'none',
          background: 'transparent',
          color: 'inherit',
          font: 'inherit',
          minWidth: 220
        }}
      />
      {busy && <span style={{ fontSize: 12, opacity: 0.6 }}>…</span>}
    </NodeViewWrapper>
  )
}

export const LlmPrompt = Node.create<LlmPromptOptions>({
  name: 'llmPrompt',
  group: 'block',
  atom: true,
  selectable: false,
  addOptions() {
    return { onRun: async () => '' }
  },
  parseHTML() {
    return [{ tag: 'div[data-llm-prompt]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-llm-prompt': 'true' })]
  },
  addNodeView() {
    return ReactNodeViewRenderer(Badge)
  },
  addInputRules() {
    return [
      new InputRule({
        find: /^\/llm\s$/,
        handler: ({ range, chain }) => {
          chain().deleteRange(range).insertContent({ type: 'llmPrompt' }).run()
        }
      })
    ]
  }
})
