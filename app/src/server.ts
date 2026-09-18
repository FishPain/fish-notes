import express, { Application, Request, Response, NextFunction } from 'express'
import Database from 'better-sqlite3'
import { GenerateFn } from './ask.service.js'
import { errorHandler } from './utils/http-errors.js'
import { routes } from './routes.js'

// The Electron renderer (localhost:5173 in dev, file:// in prod) is a different
// origin than the engine, so cross-origin fetches need CORS. The token is the
// real gate; allowing any origin just lets browsers make the request. Preflight
// (OPTIONS) must be answered BEFORE the token check, since it carries no auth.
const cors = (_req: Request, res: Response, next: NextFunction): void => {
  res.header('access-control-allow-origin', '*')
  res.header('access-control-allow-headers', 'authorization, content-type')
  res.header('access-control-allow-methods', 'GET, POST, PATCH, DELETE, OPTIONS')
  next()
}

export const buildServer = (db: Database.Database, generate: GenerateFn, token: string): Application => {
  const app = express()
  app.use(cors)
  app.options('*', (_req, res) => res.sendStatus(204))
  app.use(express.json({ limit: '25mb' }))
  routes(app, db, generate, token)
  app.use(errorHandler)
  return app
}
