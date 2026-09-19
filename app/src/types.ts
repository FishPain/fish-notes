export interface CaptureSource {
  type: 'web' | 'app' | 'screen'
  url?: string
  anchor?: string
  appName?: string
  windowTitle?: string
}

export interface CaptureInput {
  content: string
  contextText?: string
  note?: string
  source: CaptureSource
  screenshot?: string
  tags?: string[]
  capturedAt?: string
}

export interface Capture {
  id: number
  content: string
  contextText: string
  note: string
  source: CaptureSource
  screenshot: string | null
  tags: string[]
  capturedAt: string
}

export interface SearchResult {
  capture: Capture
  score: number
}

export interface Segment {
  id: string
  heading: string
  text: string
  origin: 'ai' | 'user'
  citations: number[]
}

export interface Canvas {
  id: number
  title: string
  description: string
  doc: unknown
  updatedAt: string
  collatedAt: string
}

// What the generator returns before validation/merge (no id/origin yet).
export interface RawSegment {
  heading: string
  text: string
  citations: number[]
}
