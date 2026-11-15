import { describe, expect, it } from 'vitest'
import { SIZE_SCALES, STYLE_CATEGORIES, isValidSize, sizesFor } from './size-scales'

describe('size scales', () => {
  it('covers every category', () => {
    for (const c of STYLE_CATEGORIES) expect(SIZE_SCALES[c].length).toBeGreaterThan(0)
  })
  it('jackets and outerwear share the apparel scale', () => {
    expect(sizesFor('jacket')).toEqual(['XS', 'S', 'M', 'L', 'XL', 'XXL'])
    expect(sizesFor('outerwear')).toEqual(sizesFor('jacket'))
  })
  it('bags and small leather goods are one size', () => {
    expect(sizesFor('bag')).toEqual(['ONE'])
    expect(sizesFor('slg')).toEqual(['ONE'])
  })
  it('belts run 28 to 44 in even inches', () => {
    expect(sizesFor('belt')).toEqual(['28', '30', '32', '34', '36', '38', '40', '42', '44'])
  })
  it('an unknown category has no sizes and accepts nothing', () => {
    expect(sizesFor('hat')).toEqual([])
    expect(isValidSize('hat', 'M')).toBe(false)
  })
  it('validates a size against its category', () => {
    expect(isValidSize('jacket', 'M')).toBe(true)
    expect(isValidSize('bag', 'M')).toBe(false)
    expect(isValidSize('bag', 'ONE')).toBe(true)
  })
})
