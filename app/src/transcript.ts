// Detect + clean subtitle/caption files (VTT/SRT) to plain text before embedding.
// Drops the WEBVTT header, NOTE blocks, cue numbers, timestamp/cue-setting lines and
// inline tags (<v Speaker>, <c>, <00:00:01.000>), and collapses the duplicate lines
// that auto-generated ("rolling") captions repeat.
export const isSubtitles = (name: string, text: string): boolean =>
  /\.(vtt|srt)$/i.test(name) ||
  /^﻿?WEBVTT/.test(text) ||
  /\d{2}:\d{2}:\d{2}[.,]\d{3}\s*-->/m.test(text)

export const cleanTranscript = (text: string): string => {
  const lines = text.split(/\r?\n/)
  const out: string[] = []
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim()
    if (!line) continue
    if (/^WEBVTT/.test(line) || /^NOTE\b/.test(line)) continue
    if (line.includes('-->')) continue // timestamp / cue settings line
    // Cue identifier: any line (number OR uuid) immediately before a timestamp line.
    let j = i + 1
    while (j < lines.length && !lines[j].trim()) j++
    if (j < lines.length && lines[j].includes('-->')) continue
    line = line.replace(/<[^>]+>/g, '').trim() // strip <v ...>, <c>, <00:..> tags
    if (!line) continue
    if (out.length && out[out.length - 1].toLowerCase() === line.toLowerCase()) continue // dedupe repeats
    out.push(line)
  }
  return out.join('\n')
}
