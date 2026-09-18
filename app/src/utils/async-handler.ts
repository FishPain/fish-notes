import { Request, Response, NextFunction, RequestHandler } from 'express'

// Express 4 does not forward async handler rejections to errorHandler; this does.
export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next)
  }
