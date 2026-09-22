import { Application, Router } from 'express'
import Database from 'better-sqlite3'
import { GenerateFn } from './ask.service.js'
import { GenerateMarkdownFn } from './ai/markdown-generator.js'
import { requireToken } from './middleware/require-token.js'
import { captureController } from './routes/capture/capture.controller.js'
import { searchController } from './routes/search/search.controller.js'
import { askController } from './routes/ask/ask.controller.js'
import { chatController } from './routes/chat/chat.controller.js'
import { chatsController } from './routes/chats/chats.controller.js'
import { canvasController } from './routes/canvas/canvas.controller.js'

export const routes = (
  app: Application,
  db: Database.Database,
  generate: GenerateFn,
  token: string,
  generateMarkdown: GenerateMarkdownFn
): void => {
  const api = Router()
  api.use(requireToken(token))
  api.use('/capture', captureController(db, generate))
  api.use('/search', searchController(db))
  api.use('/ask', askController(db, generate))
  api.use('/chat', chatController(db, generate))
  api.use('/chats', chatsController(db))
  api.use('/canvas', canvasController(db, generateMarkdown))
  app.use('/', api)
}
