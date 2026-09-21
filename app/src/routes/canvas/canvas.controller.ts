import { Router } from 'express'
import { object, string } from 'yup'
import Database from 'better-sqlite3'
import { httpErrors, Reason, throwHttpError } from '../../utils/http-errors.js'
import { asyncHandler } from '../../utils/async-handler.js'
import { createCanvas, listCanvases, getCanvas, saveDoc, deleteCanvas } from '../../canvas.service.js'
import { draftFromSources, completeInline } from '../../draft.service.js'
import { GenerateMarkdownFn } from '../../markdown-generator.js'

const CreateSchema = object({ title: string().trim().required(), description: string().trim() })

export const canvasController = (db: Database.Database, generate: GenerateMarkdownFn): Router => {
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

  router.patch('/:id', (req, res) => {
    if (!getCanvas(db, Number(req.params.id))) {
      throwHttpError(httpErrors.notFound, Reason.NotFound, res)
      return
    }
    saveDoc(db, Number(req.params.id), req.body.doc)
    res.status(200).json({ ok: true })
  })

  router.delete('/:id', (req, res) => {
    if (!getCanvas(db, Number(req.params.id))) {
      throwHttpError(httpErrors.notFound, Reason.NotFound, res)
      return
    }
    deleteCanvas(db, Number(req.params.id))
    res.status(204).end()
  })

  router.post(
    '/:id/draft',
    asyncHandler(async (req, res) => {
      if (!getCanvas(db, Number(req.params.id))) {
        throwHttpError(httpErrors.notFound, Reason.NotFound, res)
        return
      }
      const markdown = await draftFromSources(db, Number(req.params.id), generate)
      res.json({ markdown })
    })
  )

  router.post(
    '/:id/complete',
    asyncHandler(async (req, res) => {
      if (!getCanvas(db, Number(req.params.id))) {
        throwHttpError(httpErrors.notFound, Reason.NotFound, res)
        return
      }
      const { prompt = '', doc = '' } = req.body as { prompt?: string; doc?: string }
      const markdown = await completeInline(db, Number(req.params.id), prompt, doc, generate)
      res.json({ markdown })
    })
  )

  return router
}
