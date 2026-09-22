export interface CaptureSource {
  type: 'web' | 'app' | 'screen' | 'upload'
  url?: string
  anchor?: string
  appName?: string
  windowTitle?: string
  // Uploaded-document chunks: filename, shared id per upload, and chunk position.
  name?: string
  uploadId?: string
  chunkIndex?: number
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
