import express, { Application } from 'express'
import Database from 'better-sqlite3'
import { GenerateFn } from './ask.service.js'
import { errorHandler } from './utils/http-errors.js'
import { routes } from './routes.js'

export const buildServer = (db: Database.Database, generate: GenerateFn, token: string): Application => {
  const app = express()
  app.use(express.json({ limit: '25mb' }))
  routes(app, db, generate, token)
  app.use(errorHandler)
  return app
}
