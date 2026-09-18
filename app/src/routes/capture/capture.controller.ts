import { Router } from 'express'
import { object, string, array } from 'yup'
import Database from 'better-sqlite3'
import { httpErrors, Reason, throwHttpError } from '../../utils/http-errors.js'
import { insertCapture, listCaptures } from '../../capture.service.js'
import { CaptureInput } from '../../types.js'

const CaptureSchema = object({
  content: string().trim().required(),
  contextText: string().trim(),
  note: string().trim(),
  source: object({ type: string().oneOf(['web', 'app']).required() }).required(),
  screenshot: string(),
  tags: array(string()),
  capturedAt: string()
})

export const captureController = (db: Database.Database): Router => {
  const router = Router()

  router.post('/', async (req, res) => {
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

  router.get('/', (_req, res) => res.json(listCaptures(db)))

  return router
}
