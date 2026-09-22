// Detect + clean subtitle/caption files (VTT/SRT) to plain text before embedding.
// Drops the WEBVTT header, NOTE blocks, cue numbers, timestamp/cue-setting lines and
// inline tags (<v Speaker>, <c>, <00:00:01.000>), and collapses the duplicate lines
// that auto-generated ("rolling") captions repeat.
export const isSubtitles = (name: string, text: string): boolean =>
  /\.(vtt|srt)$/i.test(name) ||
  /^﻿?WEBVTT/.test(text) ||
  /\d{2}:\d{2}:\d{2}[.,]\d{3}\s*-->/m.test(text)

export const cleanTranscript = (text: string): string => {
  const out: string[] = []
  for (const raw of text.split(/\r?\n/)) {
    let line = raw.trim()
    if (!line) continue
    if (/^WEBVTT/.test(line) || /^NOTE\b/.test(line)) continue
    if (/^\d+$/.test(line)) continue // cue number
    if (line.includes('-->')) continue // timestamp / cue settings line
    line = line.replace(/<[^>]+>/g, '').trim() // strip <v ...>, <c>, <00:..> tags
    if (!line) continue
    if (out.length && out[out.length - 1].toLowerCase() === line.toLowerCase()) continue // dedupe repeats
    out.push(line)
  }
  return out.join('\n')
}
