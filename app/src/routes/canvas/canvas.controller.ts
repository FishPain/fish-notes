import { Router } from 'express'
import { object, string } from 'yup'
import Database from 'better-sqlite3'
import { httpErrors, Reason, throwHttpError } from '../../utils/http-errors.js'
import { asyncHandler } from '../../utils/async-handler.js'
import { createCanvas, listCanvases, getCanvas, updateSegment } from '../../canvas.service.js'
import { collate, GenerateSegmentsFn } from '../../collate.service.js'

const TitleSchema = object({ title: string().trim().required() })

export const canvasController = (db: Database.Database, generateSegments: GenerateSegmentsFn): Router => {
  const router = Router()

  router.post(
    '/',
    asyncHandler(async (req, res) => {
      let body
      try {
        body = await TitleSchema.validate(req.body, { abortEarly: true, stripUnknown: true })
      } catch {
        throwHttpError(httpErrors.badRequest, Reason.MissingOrInvalidFields, res)
        return
      }
      res.status(201).json({ id: createCanvas(db, body.title) })
    })
  )

  router.get('/', (_req, res) => res.json(listCanvases(db)))

  router.get('/:id', (req, res) => {
    const canvas = getCanvas(db, Number(req.params.id))
    return canvas ? res.json(canvas) : res.status(404).json({ error: 'not found' })
  })

  router.patch('/:id/segments/:segmentId', (req, res) => {
    updateSegment(db, Number(req.params.id), req.params.segmentId, String(req.body.text ?? ''))
    res.json(getCanvas(db, Number(req.params.id)))
  })

  router.post(
    '/:id/collate',
    asyncHandler(async (req, res) => {
      const doc = await collate(db, Number(req.params.id), generateSegments)
      res.json({ doc })
    })
  )

  return router
}
