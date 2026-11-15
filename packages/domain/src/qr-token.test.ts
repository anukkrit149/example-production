import { describe, expect, it } from 'vitest'
import { generateQrToken, isQrToken, normalizeQrToken } from './qr-token'

describe('qr token', () => {
  it('generates HF-P- plus 8 safe characters', () => {
    const t = generateQrToken()
    expect(t).toMatch(/^HF-P-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/)
  })
  it('is deterministic for a given random source', () => {
    const r = () => 0.5
    expect(generateQrToken(r)).toBe(generateQrToken(r))
  })
  it('normalizes case and whitespace', () => {
    expect(normalizeQrToken(' hf-p-7k3m9q2x ')).toBe('HF-P-7K3M9Q2X')
  })
  it('rejects ambiguous characters and wrong shapes', () => {
    expect(normalizeQrToken('HF-P-7K3M9Q20')).toBeNull()
    expect(normalizeQrToken('HF-B-7K3M9Q2X')).toBeNull()
    expect(normalizeQrToken('7K3M9Q2X')).toBeNull()
    expect(isQrToken('HF-P-SEEDAAAA')).toBe(true)
  })
})
