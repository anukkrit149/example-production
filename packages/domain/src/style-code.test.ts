import { describe, expect, it } from 'vitest'
import { STYLE_CODE_RE, isStyleCode, normalizeStyleCode } from './style-code'

describe('style code', () => {
  it('accepts the seeded codes', () => {
    expect(isStyleCode('LJ-204')).toBe(true)
    expect(isStyleCode('TB-018')).toBe(true)
  })
  it('normalises case and whitespace before checking', () => {
    expect(normalizeStyleCode('  lj-204 ')).toBe('LJ-204')
    expect(isStyleCode('lj-204')).toBe(true)
  })
  it('must start with a letter', () => {
    expect(isStyleCode('1AB')).toBe(false)
    expect(isStyleCode('-AB')).toBe(false)
  })
  it('is 2 to 12 characters — it prints on a 50 mm label', () => {
    expect(isStyleCode('A')).toBe(false)
    expect(isStyleCode('AB')).toBe(true)
    expect(isStyleCode('ABCDEFGHIJKL')).toBe(true)
    expect(isStyleCode('ABCDEFGHIJKLM')).toBe(false)
  })
  it('allows only letters, digits and hyphens', () => {
    expect(isStyleCode('LJ_204')).toBe(false)
    expect(isStyleCode('LJ 204')).toBe(false)
    expect(STYLE_CODE_RE.test('LJ.204')).toBe(false)
  })
})
