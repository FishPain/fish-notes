import { CHUNK } from './constants.js'

const SENTENCE = /[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g

// Break text into small units at natural boundaries — paragraph → line → sentence —
// so chunks never start or end mid-sentence. A unit longer than `max` (a run-on line
// or a giant token) is split on word boundaries, and only a lone word > max is sliced.
const toUnits = (text: string, max: number): string[] => {
  const units: string[] = []
  for (const para of text.split(/\n\s*\n/)) {
    for (const line of para.split(/\n/)) {
      for (const raw of line.trim().match(SENTENCE) ?? []) {
        const s = raw.trim()
        if (!s) continue
        if (s.length <= max) {
          units.push(s)
          continue
        }
        let cur = ''
        for (const word of s.split(/\s+/)) {
          if (cur && `${cur} ${word}`.length > max) {
            units.push(cur)
            cur = ''
          }
          cur = cur ? `${cur} ${word}` : word
          while (cur.length > max) {
            units.push(cur.slice(0, max))
            cur = cur.slice(max)
          }
        }
        if (cur) units.push(cur)
      }
    }
  }
  return units
}

// Greedily pack boundary units up to ~size, carrying a tail of trailing units (up to
// `overlap` chars) into the next chunk for continuity. Chunks stay <= size, and every
// boundary is a real sentence/line break (no mid-word cuts except a lone giant token).
export const chunkText = (text: string, size = CHUNK.chars, overlap = CHUNK.overlap): string[] => {
  const units = toUnits(text, size)
  const chunks: string[] = []
  let cur: string[] = []
  let len = 0

  for (const u of units) {
    if (len > 0 && len + 1 + u.length > size) {
      chunks.push(cur.join(' '))
      // Overlap: keep trailing whole units whose combined length fits in `overlap`.
      const tail: string[] = []
      let t = 0
      for (let i = cur.length - 1; i >= 0; i--) {
        if (t + cur[i].length > overlap) break
        tail.unshift(cur[i])
        t += cur[i].length + 1
      }
      cur = tail
      len = t
    }
    cur.push(u)
    len += u.length + 1
  }
  if (cur.length) chunks.push(cur.join(' '))
  return chunks.filter((c) => c.trim())
}
