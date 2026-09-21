import { app } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// User config lives in userData/settings.json, keyed by the same env-var names the
// engine reads (constants.ts). load-env.ts merges it into process.env at startup.
const settingsPath = (): string => join(app.getPath('userData'), 'settings.json')

export const readSettings = (): Record<string, string> => {
  try {
    const parsed = JSON.parse(readFileSync(settingsPath(), 'utf8'))
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {} // missing or unreadable → no overrides
  }
}

export const writeSettings = (partial: Record<string, string>): void => {
  const merged = { ...readSettings(), ...partial }
  writeFileSync(settingsPath(), JSON.stringify(merged, null, 2))
}
