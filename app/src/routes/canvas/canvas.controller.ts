import { Router } from 'express'
import { object, string } from 'yup'
import Database from 'better-sqlite3'
import { httpErrors, Reason, throwHttpError } from '../../utils/http-errors.js'
import { asyncHandler } from '../../utils/async-handler.js'
import { createCanvas, listCanvases, getCanvas, saveDoc } from '../../canvas.service.js'
import { countCapturesSince } from '../../capture.service.js'
import { draftFromSources, GenerateSegmentsFn } from '../../draft.service.js'

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
    res.json({ ...canvas, newSourceCount: countCapturesSince(db, canvas.collatedAt) })
  })

  router.patch('/:id', (req, res) => {
    if (!getCanvas(db, Number(req.params.id))) {
      throwHttpError(httpErrors.notFound, Reason.NotFound, res)
      return
    }
    saveDoc(db, Number(req.params.id), req.body.doc)
    res.status(200).json({ ok: true })
  })

  router.post(
    '/:id/draft',
    asyncHandler(async (req, res) => {
      if (!getCanvas(db, Number(req.params.id))) {
        throwHttpError(httpErrors.notFound, Reason.NotFound, res)
        return
      }
      const sections = await draftFromSources(db, Number(req.params.id), generateSegments)
      res.json({ sections })
    })
  )

  return router
}
