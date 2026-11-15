import { describe, expect, it } from 'vitest'
import { measureWithin } from './measure'

describe('measureWithin', () => {
  it('open ranges accept everything finite', () => {
    expect(measureWithin(3, null, null)).toBe(true)
    expect(measureWithin(-1, null, null)).toBe(true)
    expect(measureWithin(Number.NaN, null, null)).toBe(false)
  })
  it('closed and half-open ranges are inclusive', () => {
    expect(measureWithin(44, 44, 46)).toBe(true)
    expect(measureWithin(46, 44, 46)).toBe(true)
    expect(measureWithin(46.01, 44, 46)).toBe(false)
    expect(measureWithin(43.99, 44, null)).toBe(false)
    expect(measureWithin(10, null, 12)).toBe(true)
  })
})
