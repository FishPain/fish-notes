import { Router } from 'express'
import { object, string, array } from 'yup'
import Database from 'better-sqlite3'
import { httpErrors, Reason, throwHttpError } from '../../utils/http-errors.js'
import { asyncHandler } from '../../utils/async-handler.js'
import { randomUUID } from 'node:crypto'
import { validateBody } from '../../utils/validate.js'
import { insertCapture, listCaptures, deleteCapture, deleteUpload } from '../../capture.service.js'
import { ocrImage } from '../../ai/ocr.js'
import { chunkText } from '../../chunk.js'
import { isSubtitles, cleanTranscript } from '../../transcript.js'
import { GenerateFn } from '../../ask.service.js'
import { CaptureInput, CaptureSource } from '../../types.js'

const CaptureSchema = object({
  content: string().trim().required(),
  contextText: string().trim(),
  note: string().trim(),
  // Keep url/anchor/etc. — without them here, stripUnknown drops the source location.
  source: object({
    type: string().oneOf(['web', 'app', 'screen']).required(),
    url: string(),
    anchor: string(),
    appName: string(),
    windowTitle: string()
  }).required(),
  screenshot: string().nullable(), // capturers send null when there's no image
  tags: array(string()),
  capturedAt: string()
})

const ScreenSchema = object({ pngBase64: string().required() })
const UploadSchema = object({ name: string().trim().required(), text: string().required() })

// Best-effort 2-3 sentence summary of an uploaded doc; '' if the model call fails.
const summarize = async (generate: GenerateFn, name: string, text: string): Promise<string> => {
  try {
    return (
      await generate(
        `Summarize this document in 2-3 sentences for a browsing list. Output only the summary.\n\nTITLE: ${name}\n\n${text.slice(0, 16000)}`
      )
    ).trim()
  } catch {
    return ''
  }
}

export const captureController = (db: Database.Database, generate: GenerateFn): Router => {
  const router = Router()

  router.post(
    '/',
    asyncHandler(async (req, res) => {
      const body = await validateBody(CaptureSchema, req.body, res)
      if (!body) return
      const id = await insertCapture(db, body as unknown as CaptureInput)
      res.status(201).json({ id })
    })
  )

  // Screen-region capture: OCR the PNG via the proxy vision model, store as a capture.
  router.post(
    '/screen',
    asyncHandler(async (req, res) => {
      const body = await validateBody(ScreenSchema, req.body, res)
      if (!body) return
      const text = await ocrImage(body.pngBase64)
      if (!text.trim()) {
        throwHttpError(httpErrors.badRequest, Reason.MissingOrInvalidFields, res)
        return
      }
      const id = await insertCapture(db, {
        content: text,
        source: { type: 'screen' },
        screenshot: `data:image/png;base64,${body.pngBase64}`,
        tags: [],
        capturedAt: new Date().toISOString()
      })
      res.status(201).json({ id })
    })
  )

  // Upload a document: chunk it, embed + store each chunk as an 'upload' capture.
  router.post(
    '/upload',
    asyncHandler(async (req, res) => {
      const body = await validateBody(UploadSchema, req.body, res)
      if (!body) return
      // Subtitle files are mostly timestamps/cue noise — strip to plain text first.
      const text = isSubtitles(body.name, body.text) ? cleanTranscript(body.text) : body.text
      const chunks = chunkText(text)
      if (chunks.length === 0) {
        throwHttpError(httpErrors.badRequest, Reason.MissingOrInvalidFields, res)
        return
      }
      const uploadId = randomUUID()
      const capturedAt = new Date().toISOString()
      const summary = await summarize(generate, body.name, text)
      // Sequential: keeps embed calls friendly to the proxy's rate limit. The whole-doc
      // summary rides on the first chunk's source so the UI can show it per document.
      for (let i = 0; i < chunks.length; i++) {
        const source: CaptureSource = { type: 'upload', name: body.name, uploadId, chunkIndex: i }
        if (i === 0 && summary) source.summary = summary
        await insertCapture(db, { content: chunks[i], source, tags: [], capturedAt })
      }
      res.status(201).json({ uploadId, chunks: chunks.length })
    })
  )

  router.get('/', (_req, res) => res.json(listCaptures(db)))

  // Delete every chunk of one uploaded document.
  router.delete('/upload/:uploadId', (req, res) => {
    deleteUpload(db, req.params.uploadId)
    res.status(204).end()
  })

  // Idempotent: deleting a missing id is a no-op and still 204.
  router.delete('/:id', (req, res) => {
    deleteCapture(db, Number(req.params.id))
    res.status(204).end()
  })

  return router
}
