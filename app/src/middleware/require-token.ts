import { Request, Response, NextFunction } from 'express'
import { httpErrors, Reason, throwHttpError } from '../utils/http-errors.js'

export const requireToken =
  (token: string) =>
  (req: Request, res: Response, next: NextFunction): void => {
    const auth = req.header('authorization') || ''
    if (auth !== `Bearer ${token}`) {
      throwHttpError(httpErrors.unauthorized, Reason.Unauthorized, res)
      return
    }
    next()
  }
