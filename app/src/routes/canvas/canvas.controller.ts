import { Router } from 'express'
import { object, string } from 'yup'
import Database from 'better-sqlite3'
import { httpErrors, Reason, throwHttpError } from '../../utils/http-errors.js'
import { asyncHandler } from '../../utils/async-handler.js'
import { createCanvas, listCanvases, getCanvas, updateSegment } from '../../canvas.service.js'
import { collate, GenerateSegmentsFn } from '../../collate.service.js'

const CreateSchema = object({ title: string().trim().required(), description: string().trim() })

export const canvasController = (db: Database.Database, generateSegments: GenerateSegmentsFn): Router => {
  const router = Router()

  router.post(
    '/',
    asyncHandler(async (req, res) => {
      let body
      try {
        body = await CreateSchema.validate(req.body, { abortEarly: true, stripUnknown: true })
      } catch {
        throwHttpError(httpErrors.badRequest, Reason.MissingOrInvalidFields, res)
        return
      }
      res.status(201).json({ id: createCanvas(db, body.title, body.description ?? '') })
    })
  )

  router.get('/', (_req, res) => res.json(listCanvases(db)))

  router.get('/:id', (req, res) => {
    const canvas = getCanvas(db, Number(req.params.id))
    if (!canvas) {
      throwHttpError(httpErrors.notFound, Reason.NotFound, res)
      return
    }
    res.json(canvas)
  })

  router.patch('/:id/segments/:segmentId', (req, res) => {
    const id = Number(req.params.id)
    if (!getCanvas(db, id)) {
      throwHttpError(httpErrors.notFound, Reason.NotFound, res)
      return
    }
    updateSegment(db, id, req.params.segmentId, String(req.body.text ?? ''))
    res.json(getCanvas(db, id))
  })

  router.post(
    '/:id/collate',
    asyncHandler(async (req, res) => {
      const id = Number(req.params.id)
      if (!getCanvas(db, id)) {
        throwHttpError(httpErrors.notFound, Reason.NotFound, res)
        return
      }
      const doc = await collate(db, id, generateSegments)
      res.json({ doc })
    })
  )

  return router
}
