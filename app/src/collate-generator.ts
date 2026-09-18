import { generateText } from 'ai'
import { AiConfig, createModel } from './model.js'
import { RawSegment } from './types.js'
import { GenerateSegmentsFn } from './draft.service.js'

type TextFn = (prompt: string) => Promise<string>

const buildPrompt = (
  topic: string,
  sources: { id: number; content: string }[],
  lockedText: string[]
): string => {
  const src = sources.map((s) => `[${s.id}] ${s.content}`).join('\n')
  const mine = lockedText.length ? `\n\nAlready-written sections to COMPLEMENT (do not repeat or contradict):\n- ${lockedText.join('\n- ')}` : ''
  return `You are collating research notes on "${topic}" into a brief.
Use ONLY the numbered sources. Return a JSON array of sections, each:
{ "heading": string, "text": string, "citations": number[] }  // citations are source numbers you used
Return ONLY the JSON array.${mine}

SOURCES:\n${src}`
}

// Extract the first JSON array from model text (handles ```json fences / prose).
const parseSegments = (text: string): RawSegment[] => {
  const start = text.indexOf('[')
  const end = text.lastIndexOf(']')
  if (start === -1 || end === -1 || end < start) return []
  try {
    const parsed = JSON.parse(text.slice(start, end + 1))
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((s) => s && typeof s.heading === 'string' && typeof s.text === 'string')
      .map((s) => ({
        heading: s.heading,
        text: s.text,
        citations: Array.isArray(s.citations) ? s.citations.filter((n: unknown) => typeof n === 'number') : []
      }))
  } catch {
    return []
  }
}

// textFn is injectable for testing; production builds it from the AI SDK.
export const makeSegmentGenerator = (ai: AiConfig, textFn?: TextFn): GenerateSegmentsFn => {
  const generate: TextFn =
    textFn ??
    (async (prompt: string) => {
      const { text } = await generateText({ model: createModel(ai), prompt })
      return text
    })

  return async (topic, sources, lockedText) =>
    parseSegments(await generate(buildPrompt(topic, sources, lockedText)))
}
