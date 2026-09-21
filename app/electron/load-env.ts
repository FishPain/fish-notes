import { app } from 'electron'
import { config } from 'dotenv'
import { join } from 'node:path'

// Imported FIRST by main.ts — before any engine module (constants.ts) evaluates —
// so these vars win. Set the app name so userData resolves to ".../Fish Notes",
// then load the user's key from userData/.env. We deliberately do NOT bundle .env
// into the packaged app (that would ship the key); packaged users place their key
// at ~/Library/Application Support/Fish Notes/.env. Dev still loads cwd/.env via
// constants.ts (dotenv won't override what's already set here).
app.setName('Fish Notes')
config({ path: join(app.getPath('userData'), '.env') })
