import { Router } from 'express'
import Database from 'better-sqlite3'
import { keywordSearch, semanticSearch, hybridSearch } from '../../search.service.js'
import { asyncHandler } from '../../utils/async-handler.js'

const clampLimit = (raw: string): number => {
  const n = Math.floor(Number(raw))
  if (!Number.isFinite(n) || n < 1) return 20
  return Math.min(n, 100)
}

export const searchController = (db: Database.Database): Router => {
  const router = Router()

  router.get(
    '/',
    asyncHandler(async (req, res) => {
      const { q = '', mode = 'hybrid', limit = '20' } = req.query as {
        q?: string
        mode?: string
        limit?: string
      }
      const n = clampLimit(limit)
      if (!q) {
        res.json([])
        return
      }
      if (mode === 'keyword') {
        res.json(keywordSearch(db, q, n))
        return
      }
      if (mode === 'semantic') {
        res.json(await semanticSearch(db, q, n))
        return
      }
      res.json(await hybridSearch(db, q, n))
    })
  )

  return router
}
