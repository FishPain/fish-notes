import { Application, Router } from 'express'
import Database from 'better-sqlite3'
import { GenerateFn } from './ask.service.js'
import { requireToken } from './middleware/require-token.js'
import { captureController } from './routes/capture/capture.controller.js'
import { searchController } from './routes/search/search.controller.js'
import { askController } from './routes/ask/ask.controller.js'

export const routes = (
  app: Application,
  db: Database.Database,
  generate: GenerateFn,
  token: string
): void => {
  const api = Router()
  api.use(requireToken(token))
  api.use('/capture', captureController(db))
  api.use('/search', searchController(db))
  api.use('/ask', askController(db, generate))
  app.use('/', api)
}
