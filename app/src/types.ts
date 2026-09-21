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

export interface Canvas {
  id: number
  title: string
  description: string
  doc: unknown
  updatedAt: string
}
