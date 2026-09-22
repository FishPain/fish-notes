import { describe, it, expect } from 'vitest'
import { isSubtitles, cleanTranscript } from '../src/transcript.js'

const VTT = `WEBVTT

1
00:00:01.000 --> 00:00:04.000 align:start position:0%
<v Alice>Hello everyone

2
00:00:04.000 --> 00:00:06.000
Hello everyone

3
00:00:06.000 --> 00:00:09.000
<c>Let's start the meeting</c>
`

describe('transcript', () => {
  it('detects vtt by name, header, and timestamps', () => {
    expect(isSubtitles('a.vtt', '')).toBe(true)
    expect(isSubtitles('a.txt', VTT)).toBe(true)
    expect(isSubtitles('a.txt', 'just prose')).toBe(false)
  })

  it('strips headers/cues/timestamps/tags and de-dupes repeated lines', () => {
    const out = cleanTranscript(VTT)
    expect(out).not.toMatch(/WEBVTT|-->|<|position:/)
    expect(out).not.toMatch(/^\d+$/m)
    // "Hello everyone" appears twice back-to-back → collapsed to one
    expect(out.match(/Hello everyone/g)).toHaveLength(1)
    expect(out).toContain("Let's start the meeting")
  })
})
