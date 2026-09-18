import { Mark, mergeAttributes } from '@tiptap/core'

// Visual attribution for AI-contributed text (not a lock — fully editable).
export const AiOrigin = Mark.create({
  name: 'aiOrigin',
  parseHTML() {
    return [{ tag: 'span[data-ai]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { 'data-ai': 'true', class: 'ai-origin' }), 0]
  }
})

// Inline citation to a capture id; rendered as a clickable superscript.
export const Citation = Mark.create({
  name: 'citation',
  addAttributes() {
    return { captureId: { default: null } }
  },
  parseHTML() {
    return [{ tag: 'sup[data-capture-id]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return [
      'sup',
      mergeAttributes(HTMLAttributes, { class: 'citation', 'data-capture-id': HTMLAttributes.captureId }),
      0
    ]
  }
})
