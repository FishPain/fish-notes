import { Request, Response, NextFunction } from 'express'
import { DEBUG } from '../constants.js'

export interface HttpError {
  statusCode: number
  type: string
  because: string | null
  stack?: unknown
}

export enum Reason {
  Unauthorized = 'unauthorized',
  MissingOrInvalidFields = 'missing_or_invalid_fields',
  NotFound = 'not_found'
}

export const httpErrors = {
  badRequest: { statusCode: 400, type: 'bad_request', because: null } as HttpError,
  unauthorized: { statusCode: 401, type: 'unauthorized', because: null } as HttpError,
  notFound: { statusCode: 404, type: 'not_found', because: null } as HttpError,
  serverError: (error: unknown): HttpError => ({
    statusCode: 500,
    type: 'server_error',
    because: null,
    stack: error
  })
}

export const throwHttpError = (error: HttpError, reason: Reason | null, res?: Response): void => {
  const payload: HttpError = { ...error, because: reason }
  if (res) {
    res.status(error.statusCode).json(payload)
    return
  }
  throw payload
}

export const errorHandler = (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  error: any,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  const httpError: HttpError = error && error.statusCode ? error : httpErrors.serverError(error)
  console.error(error && (error.stack || error))
  if (!DEBUG) delete httpError.stack
  res.status(httpError.statusCode).json(httpError)
}
