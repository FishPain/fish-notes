import { Router } from 'express'
import Database from 'better-sqlite3'
import { ask, GenerateFn } from '../../ask.service.js'
import { asyncHandler } from '../../utils/async-handler.js'

export const askController = (db: Database.Database, generate: GenerateFn): Router => {
  const router = Router()

  router.post(
    '/',
    asyncHandler(async (req, res) => {
      const { question = '' } = req.body as { question?: string }
      res.json(await ask(db, question, generate))
    })
  )

  return router
}
