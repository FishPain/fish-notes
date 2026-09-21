import { Router, Request, Response } from 'express'
import { object, string } from 'yup'
import Database from 'better-sqlite3'
import { httpErrors, Reason, throwHttpError } from '../../utils/http-errors.js'
import { asyncHandler } from '../../utils/async-handler.js'
import { validateBody } from '../../utils/validate.js'
import { createCanvas, listCanvases, getCanvas, saveDoc, deleteCanvas } from '../../canvas.service.js'
import { draftFromSources, completeInline } from '../../draft.service.js'
import { GenerateMarkdownFn } from '../../markdown-generator.js'

const CreateSchema = object({ title: string().trim().required(), description: string().trim() })

export const canvasController = (db: Database.Database, generate: GenerateMarkdownFn): Router => {
  const router = Router()

  // Fetch the note named by :id, or send 404 and return null (caller returns early).
  const requireCanvas = (req: Request, res: Response) => {
    const canvas = getCanvas(db, Number(req.params.id))
    if (!canvas) throwHttpError(httpErrors.notFound, Reason.NotFound, res)
    return canvas
  }

  router.post(
    '/',
    asyncHandler(async (req, res) => {
      const body = await validateBody(CreateSchema, req.body, res)
      if (!body) return
      res.status(201).json({ id: createCanvas(db, body.title, body.description ?? '') })
    })
  )

  router.get('/', (_req, res) => res.json(listCanvases(db)))

  router.get('/:id', (req, res) => {
    const canvas = requireCanvas(req, res)
    if (canvas) res.json(canvas)
  })

  router.patch('/:id', (req, res) => {
    if (!requireCanvas(req, res)) return
    saveDoc(db, Number(req.params.id), req.body.doc)
    res.status(200).json({ ok: true })
  })

  router.delete('/:id', (req, res) => {
    if (!requireCanvas(req, res)) return
    deleteCanvas(db, Number(req.params.id))
    res.status(204).end()
  })

  router.post(
    '/:id/draft',
    asyncHandler(async (req, res) => {
      if (!requireCanvas(req, res)) return
      res.json({ markdown: await draftFromSources(db, Number(req.params.id), generate) })
    })
  )

  router.post(
    '/:id/complete',
    asyncHandler(async (req, res) => {
      if (!requireCanvas(req, res)) return
      const { prompt = '', doc = '' } = req.body as { prompt?: string; doc?: string }
      res.json({ markdown: await completeInline(db, Number(req.params.id), prompt, doc, generate) })
    })
  )

  return router
}
