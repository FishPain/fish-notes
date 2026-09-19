import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Node as PMNode } from '@tiptap/pm/model'

// Block-level provenance: which blocks were written by AI vs the human. AI-inserted
// blocks carry origin='ai'; editing an AI block reclaims it (origin back to null).
// Block-level (a node attribute) not inline marks — inline marks bleed into typed
// text and are messy to flip (see the removed editor-marks.ts / commit f38e827).

const TAGGED_TYPES = new Set(['paragraph', 'heading', 'blockquote', 'codeBlock', 'listItem'])
// Transactions carrying this meta are our own attribute writes — the flip plugin
// must ignore them, or it would recurse / undo the very tagging we just applied.
const SKIP = 'provenanceSkip'

// A node is "fully AI" if it's a tagged block with origin 'ai', or a container
// (e.g. a list) whose every child is fully AI. Used by regeneration to remove only
// AI content while leaving anything the human touched (which flipped to null) intact.
export const isFullyAi = (node: PMNode): boolean => {
  if (TAGGED_TYPES.has(node.type.name)) return node.attrs.origin === 'ai'
  if (node.childCount === 0) return false
  let all = true
  node.forEach((child) => {
    if (!isFullyAi(child)) all = false
  })
  return all
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    provenance: {
      // Tag every block node in [from, to] as AI-authored.
      markRangeAsAi: (from: number, to: number) => ReturnType
    }
  }
}

export const Provenance = Extension.create({
  name: 'provenance',

  addGlobalAttributes() {
    return [
      {
        types: [...TAGGED_TYPES],
        attributes: {
          origin: {
            default: null,
            parseHTML: (el) => el.getAttribute('data-origin'),
            // Omit the attribute for human/unknown blocks so their markup stays clean.
            renderHTML: (attrs) => (attrs.origin ? { 'data-origin': attrs.origin } : {})
          }
        }
      }
    ]
  },

  addCommands() {
    return {
      markRangeAsAi:
        (from, to) =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            tr.doc.nodesBetween(from, to, (node, pos) => {
              if (TAGGED_TYPES.has(node.type.name)) tr.setNodeAttribute(pos, 'origin', 'ai')
            })
            tr.setMeta(SKIP, true)
          }
          return true
        }
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('provenanceFlip'),
        // When the user edits inside an AI block, that block becomes theirs.
        appendTransaction(trs, _oldState, newState) {
          const edits = trs.filter((t) => t.docChanged && !t.getMeta(SKIP))
          if (edits.length === 0) return null

          const size = newState.doc.content.size
          const seen = new Set<number>()
          let tr: typeof newState.tr | null = null

          for (const t of edits) {
            for (const map of t.mapping.maps) {
              map.forEach((_os, _oe, ns, ne) => {
                newState.doc.nodesBetween(Math.min(ns, size), Math.min(ne, size), (node, pos) => {
                  if (TAGGED_TYPES.has(node.type.name) && node.attrs.origin === 'ai' && !seen.has(pos)) {
                    seen.add(pos)
                    tr = (tr ?? newState.tr).setNodeAttribute(pos, 'origin', null)
                  }
                })
              })
            }
          }

          if (tr) (tr as typeof newState.tr).setMeta(SKIP, true)
          return tr
        }
      })
    ]
  }
})
