import { randomBytes } from 'crypto'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'

// A stable token persisted in userData so the browser extension's saved token
// keeps working across app restarts.
export const loadOrCreateToken = (userDataDir: string): string => {
  const file = join(userDataDir, 'engine-token')
  if (existsSync(file)) return readFileSync(file, 'utf8').trim()
  mkdirSync(userDataDir, { recursive: true })
  const token = randomBytes(32).toString('hex')
  writeFileSync(file, token, 'utf8')
  return token
}
