import { CHUNK } from './constants.js'

// Split text into overlapping, paragraph-aware chunks for embedding. Greedily packs
// paragraphs up to CHUNK.chars; carries ~CHUNK.overlap chars of tail into the next
// chunk for continuity; hard-splits any single paragraph longer than the budget.
export const chunkText = (text: string, size = CHUNK.chars, overlap = CHUNK.overlap): string[] => {
  const paras = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
  const chunks: string[] = []
  let buf = ''

  const flush = (): void => {
    if (!buf.trim()) return
    chunks.push(buf.trim())
    buf = overlap > 0 ? buf.slice(-overlap) : ''
  }

  for (const para of paras) {
    // A single paragraph bigger than the budget: hard-split it.
    if (para.length > size) {
      flush()
      buf = ''
      for (let i = 0; i < para.length; i += size - overlap) {
        chunks.push(para.slice(i, i + size))
      }
      continue
    }
    if (buf && buf.length + para.length + 2 > size) flush()
    buf = buf ? `${buf}\n\n${para}` : para
  }
  flush()
  return chunks.filter(Boolean)
}
