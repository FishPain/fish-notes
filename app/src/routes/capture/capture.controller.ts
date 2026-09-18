import { Router } from 'express'
import { object, string, array } from 'yup'
import Database from 'better-sqlite3'
import { httpErrors, Reason, throwHttpError } from '../../utils/http-errors.js'
import { asyncHandler } from '../../utils/async-handler.js'
import { insertCapture, listCaptures, deleteCapture } from '../../capture.service.js'
import { CaptureInput } from '../../types.js'

const CaptureSchema = object({
  content: string().trim().required(),
  contextText: string().trim(),
  note: string().trim(),
  // Keep url/anchor/etc. — without them here, stripUnknown drops the source location.
  source: object({
    type: string().oneOf(['web', 'app']).required(),
    url: string(),
    anchor: string(),
    appName: string(),
    windowTitle: string()
  }).required(),
  screenshot: string().nullable(), // capturers send null when there's no image
  tags: array(string()),
  capturedAt: string()
})

export const captureController = (db: Database.Database): Router => {
  const router = Router()

  router.post(
    '/',
    asyncHandler(async (req, res) => {
      let body
      try {
        body = await CaptureSchema.validate(req.body, { abortEarly: true, stripUnknown: true })
      } catch {
        throwHttpError(httpErrors.badRequest, Reason.MissingOrInvalidFields, res)
        return
      }
      const id = await insertCapture(db, body as unknown as CaptureInput)
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
