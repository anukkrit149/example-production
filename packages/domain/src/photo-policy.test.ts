import { describe, expect, it } from 'vitest'
import { photoRequirement } from './photo-policy'

describe('photo policy', () => {
  it('requires photos on activation, QA, and custody changes', () => {
    for (const t of ['PIECE_ACTIVATED', 'STAGE_QA_PASSED', 'STAGE_QA_FAILED', 'ISSUED', 'RECEIVED', 'PACKED'] as const)
      expect(photoRequirement(t)).toBe('required')
  })
  it('makes photos optional on reject', () => {
    for (const t of ['PIECE_REJECTED'] as const) expect(photoRequirement(t)).toBe('optional')
  })
  it('hold and release carry a photo like every other evidence event', () => {
    expect(photoRequirement('PIECE_HELD')).toBe('required')
    expect(photoRequirement('PIECE_RELEASED')).toBe('required')
  })
  it('needs none for labels and corrections', () => {
    for (const t of ['LABEL_PRINT_REQUESTED', 'LABEL_REPRINT_REQUESTED', 'CORRECTION'] as const) expect(photoRequirement(t)).toBe('none')
  })
})
