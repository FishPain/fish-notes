import React, { useState } from 'react'
import { Node, mergeAttributes, InputRule } from '@tiptap/core'
import { ReactNodeViewRenderer, NodeViewWrapper, NodeViewProps } from '@tiptap/react'

export interface LlmPromptOptions {
  onRun: (instruction: string) => Promise<string>
}

const Badge = (props: NodeViewProps): React.ReactElement => {
  const { editor, node, getPos, extension } = props
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)

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
    if (md) editor.chain().focus().insertContentAt({ from: pos, to: pos + node.nodeSize }, md).run()
    else removeSelf()
  }

  return (
    <NodeViewWrapper
      as="div"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '2px 8px',
        margin: '4px 0',
        borderRadius: 8,
        background: 'rgba(120,140,255,.15)',
        border: '1px solid rgba(120,140,255,.4)'
      }}
    >
      <span contentEditable={false} style={{ fontSize: 12, fontWeight: 600, color: '#8aa0ff' }}>
        /llm
      </span>
      <input
        autoFocus
        disabled={busy}
        placeholder="Ask AI to write here…"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            run()
          } else if (e.key === 'Escape') {
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
      {busy && (
        <span contentEditable={false} style={{ fontSize: 12, opacity: 0.6 }}>
          …
        </span>
      )}
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
