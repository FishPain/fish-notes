import { Router } from 'express'
import { object, array, string, mixed } from 'yup'
import Database from 'better-sqlite3'
import { asyncHandler } from '../../utils/async-handler.js'
import { validateBody } from '../../utils/validate.js'
import { chatAnswer, ChatMessage } from '../../chat.service.js'
import { GenerateFn } from '../../ask.service.js'

const ChatSchema = object({
  messages: array(
    object({
      role: mixed<'user' | 'assistant'>().oneOf(['user', 'assistant']).required(),
      content: string().required()
    })
  ).required(),
  docIds: array(string())
})

export const chatController = (db: Database.Database, generate: GenerateFn): Router => {
  const router = Router()

  router.post(
    '/',
    asyncHandler(async (req, res) => {
      const body = await validateBody(ChatSchema, req.body, res)
      if (!body) return
      const result = await chatAnswer(db, body.messages as ChatMessage[], generate, body.docIds as string[] | undefined)
      res.json(result)
    })
  )

  return router
}
