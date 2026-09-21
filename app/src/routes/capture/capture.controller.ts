import { Router } from 'express'
import { object, string, array } from 'yup'
import Database from 'better-sqlite3'
import { httpErrors, Reason, throwHttpError } from '../../utils/http-errors.js'
import { asyncHandler } from '../../utils/async-handler.js'
import { validateBody } from '../../utils/validate.js'
import { insertCapture, listCaptures, deleteCapture } from '../../capture.service.js'
import { ocrImage } from '../../ocr.js'
import { CaptureInput } from '../../types.js'

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

export const captureController = (db: Database.Database): Router => {
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

  router.get('/', (_req, res) => res.json(listCaptures(db)))

  // Idempotent: deleting a missing id is a no-op and still 204.
  router.delete('/:id', (req, res) => {
    deleteCapture(db, Number(req.params.id))
    res.status(204).end()
  })

  return router
}
