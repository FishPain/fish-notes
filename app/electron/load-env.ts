import { app } from 'electron'
import { config } from 'dotenv'
import { join } from 'node:path'
import { readSettings } from './settings.js'

// Imported FIRST by main.ts — before any engine module (constants.ts) evaluates —
// so these vars win. Set the app name so userData resolves to ".../Fish Notes",
// then apply config: the in-app Settings (userData/settings.json) is the primary
// source; a userData/.env or cwd/.env act as fallbacks (dotenv won't override vars
// already set here). We deliberately do NOT bundle .env into packaged builds.
app.setName('Fish Notes')
Object.assign(process.env, readSettings())
config({ path: join(app.getPath('userData'), '.env') })
