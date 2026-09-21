import { Response } from 'express'
import { httpErrors, Reason, throwHttpError } from './http-errors.js'

// Validate a request body against a yup schema. Structural typing on the schema
// avoids importing yup's generics. On failure: send 400 and return undefined, so
// the caller does `const body = await validateBody(...); if (!body) return`.
export const validateBody = async <T>(
  schema: { validate: (value: unknown, opts: object) => Promise<T> },
  body: unknown,
  res: Response
): Promise<T | undefined> => {
  try {
    return await schema.validate(body, { abortEarly: true, stripUnknown: true })
  } catch {
    throwHttpError(httpErrors.badRequest, Reason.MissingOrInvalidFields, res)
    return undefined
  }
}
