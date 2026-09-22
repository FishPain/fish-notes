import { Router, Request, Response } from 'express'
import { object, array, string, mixed } from 'yup'
import Database from 'better-sqlite3'
import { httpErrors, Reason, throwHttpError } from '../../utils/http-errors.js'
import { validateBody } from '../../utils/validate.js'
import {
  createConversation,
  listConversations,
  getConversation,
  saveConversation,
  deleteConversation
} from '../../conversation.service.js'

const SaveSchema = object({
  title: string(),
  messages: array(mixed()).required(),
  docIds: array(string()).required()
})

export const chatsController = (db: Database.Database): Router => {
  const router = Router()

  const requireConversation = (req: Request, res: Response) => {
    const convo = getConversation(db, Number(req.params.id))
    if (!convo) throwHttpError(httpErrors.notFound, Reason.NotFound, res)
    return convo
  }

  router.get('/', (_req, res) => res.json(listConversations(db)))

  router.post('/', async (req, res) => {
    const body = await validateBody(SaveSchema, req.body, res)
    if (!body) return
    const id = createConversation(db, body.title ?? '', body.messages, body.docIds as string[])
    res.status(201).json({ id })
  })

  router.get('/:id', (req, res) => {
    const convo = requireConversation(req, res)
    if (convo) res.json(convo)
  })

  router.patch('/:id', async (req, res) => {
    if (!requireConversation(req, res)) return
    const body = await validateBody(SaveSchema, req.body, res)
    if (!body) return
    saveConversation(db, Number(req.params.id), { title: body.title, messages: body.messages, docIds: body.docIds as string[] })
    res.status(200).json({ ok: true })
  })

  router.delete('/:id', (req, res) => {
    deleteConversation(db, Number(req.params.id))
    res.status(204).end()
  })

  return router
}
