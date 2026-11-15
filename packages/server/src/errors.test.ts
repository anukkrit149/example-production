import { describe, expect, it } from 'vitest'
import { Prisma } from '@hf/db'
import { ApiError } from './api'
import { conflictMessage, isUniqueViolation, translatePrismaError } from './errors'

const p2002 = (target: string[] | string) =>
  new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002', clientVersion: 'test', meta: { target },
  })

describe('conflictMessage', () => {
  it('order number within a program', () => {
    expect(conflictMessage('program_id,order_number', { orderNumber: 'PO-4471', programName: 'Autumn 26' }))
      .toBe('Order PO-4471 already exists in Autumn 26')
  })
  it('line item variant', () => {
    expect(conflictMessage('order_id,style_id,size,shade', { styleCode: 'LJ-204', size: 'M', shade: 'BLK-02', orderNumber: 'PO-4471' }))
      .toBe('LJ-204 M BLK-02 is already on PO-4471. Change its quantity instead.')
  })
  it('style code', () => expect(conflictMessage('style_code', { styleCode: 'LJ-204' })).toBe('Style code LJ-204 is already taken'))
  it('team email', () => expect(conflictMessage('auth_identity', {})).toBe('Someone with that email is already on the team'))
  it('reference photo', () => expect(conflictMessage('reference_attachment_id', {})).toBe('That photo is already the reference for another style'))
  it('anything else', () => expect(conflictMessage('mystery', {})).toBe('That record already exists'))
})

describe('translatePrismaError', () => {
  it('turns P2002 into a 409 ApiError', () => {
    try {
      translatePrismaError(p2002(['style_code']), { styleCode: 'X' })
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError)
      expect((e as ApiError).status).toBe(409)
      expect((e as ApiError).code).toBe('conflict')
      expect((e as ApiError).message).toBe('Style code X is already taken')
      return
    }
    throw new Error('did not throw')
  })
  it('accepts a string target too', () => {
    expect(() => translatePrismaError(p2002('orders_program_id_order_number_key'), { orderNumber: 'A', programName: 'B' }))
      .toThrow('Order A already exists in B')
  })
  it('rethrows anything else untouched', () => {
    const e = new Error('boom')
    expect(() => translatePrismaError(e)).toThrow(e)
  })
})

describe('isUniqueViolation', () => {
  it('matches the named column only', () => {
    expect(isUniqueViolation(p2002(['qr_token']), 'qr_token')).toBe(true)
    expect(isUniqueViolation(p2002(['style_code']), 'qr_token')).toBe(false)
    expect(isUniqueViolation(new Error('x'), 'qr_token')).toBe(false)
  })
})
