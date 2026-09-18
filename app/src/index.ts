import { SERVER, DB, AI } from './constants.js'
import { openDb } from './db.js'
import { makeGenerate } from './generator.js'
import { buildServer } from './server.js'

if (!SERVER.token) {
  console.error('CANVAS_TOKEN is required')
  process.exit(1)
}

const db = openDb(DB.path)
const app = buildServer(db, makeGenerate(AI), SERVER.token)
app.listen(SERVER.port, () => console.log(`engine on http://localhost:${SERVER.port}`))
