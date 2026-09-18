import { describe, it, expect } from 'vitest'
import { httpErrors, Reason, throwHttpError } from '../src/utils/http-errors.js'

describe('throwHttpError', () => {
  it('with res, sends status + json and sets because to the reason', () => {
    let sentStatus = 0
    let sentBody: { because: string | null } = { because: 'unset' }
    const res = {
      status(code: number) {
        sentStatus = code
        return this
      },
      json(body: { because: string | null }) {
        sentBody = body
        return this
      }
    } as unknown as import('express').Response

    throwHttpError(httpErrors.unauthorized, Reason.Unauthorized, res)
    expect(sentStatus).toBe(401)
    expect(sentBody.because).toBe('unauthorized')
  })

  it('without res, throws the error payload', () => {
    expect(() => throwHttpError(httpErrors.notFound, Reason.NotFound)).toThrow()
  })
})
