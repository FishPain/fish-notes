import { SERVER, DB, AI } from './constants.js'
import { openDb } from './db.js'
import { makeGenerate } from './generator.js'
import { makeMarkdownGenerator } from './markdown-generator.js'
import { buildServer } from './server.js'

// better-sqlite3's native addon is compiled for Node 24 (see app/.nvmrc); a
// different major fails with a cryptic ERR_DLOPEN_FAILED. Fail early and clearly.
const nodeMajor = Number(process.versions.node.split('.')[0])
if (nodeMajor !== 24) {
  console.error(
    `Canvas Notes engine requires Node 24 (you are on ${process.versions.node}). Run \`nvm use\` in app/ (or \`nvm use 24\`), then retry.`
  )
  process.exit(1)
}

if (!SERVER.token) {
  console.error('CANVAS_TOKEN is required')
  process.exit(1)
}

const db = openDb(DB.path)
const app = buildServer(db, makeGenerate(AI), SERVER.token, makeMarkdownGenerator(AI))
app.listen(SERVER.port, () => console.log(`engine on http://localhost:${SERVER.port}`))
