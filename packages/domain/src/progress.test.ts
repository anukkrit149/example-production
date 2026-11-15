import { describe, expect, it } from 'vitest'
import { PIECE_STATES, STAGES, type PieceState } from './piece-state'
import { AT_OR_PAST, STARTED_STATES, emptyCounts, stageCounts, stageCountsFromRows, sumCounts } from './progress'

describe('AT_OR_PAST', () => {
  it('cutting counts CUT_OK and everything later, not pending QA', () => {
    expect(AT_OR_PAST.cutting).toContain('CUT_OK')
    expect(AT_OR_PAST.cutting).toContain('SHIPPED')
    expect(AT_OR_PAST.cutting).not.toContain('CUT_PENDING_QA')
    expect(AT_OR_PAST.cutting).not.toContain('PLANNED')
  })
  it('each later stage is a subset of the one before', () => {
    for (let i = 1; i < STAGES.length; i++) {
      const prev = new Set(AT_OR_PAST[STAGES[i - 1]!])
      for (const s of AT_OR_PAST[STAGES[i]!]) expect(prev.has(s)).toBe(true)
    }
  })
  it('packaging is exactly PACKED and SHIPPED', () => {
    expect([...AT_OR_PAST.packaging]).toEqual(['PACKED', 'SHIPPED'])
  })
  it('exception states never count as progress', () => {
    for (const stage of STAGES)
      for (const s of ['ON_HOLD', 'REJECTED', 'CANCELLED'] as PieceState[]) expect(AT_OR_PAST[stage]).not.toContain(s)
  })
  it('STARTED_STATES is everything but PLANNED and CANCELLED', () => {
    expect(STARTED_STATES).toHaveLength(PIECE_STATES.length - 2)
    expect(STARTED_STATES).not.toContain('PLANNED')
    expect(STARTED_STATES).not.toContain('CANCELLED')
    expect(STARTED_STATES).toContain('REJECTED')
  })
})

describe('stageCounts', () => {
  it('counts a mixed line item', () => {
    const c = stageCounts([
      'PLANNED', 'PLANNED', 'CUT_PENDING_QA', 'CUT_OK', 'WITH_PASTING', 'PASTE_OK',
      'STITCH_OK', 'FINISH_OK', 'QC_OK', 'PACKED', 'SHIPPED', 'ON_HOLD', 'REJECTED', 'CANCELLED',
    ])
    expect(c).toEqual({
      cutting: 8, pasting: 6, stitching: 5, finishing: 4, qc: 3, packaging: 2,
      planned: 2, rejected: 1, cancelled: 1, onHold: 1, total: 14,
    })
  })
  it('an empty list is all zeros', () => {
    expect(stageCounts([])).toEqual(emptyCounts())
  })
  it('folds grouped rows the same way', () => {
    const rows = [{ state: 'CUT_OK' as PieceState, count: 3 }, { state: 'PLANNED' as PieceState, count: 2 }]
    expect(stageCountsFromRows(rows)).toEqual({ ...emptyCounts(), cutting: 3, planned: 2, total: 5 })
  })
  it('sums roll-ups field by field', () => {
    const a = { ...emptyCounts(), cutting: 2, total: 5 }
    const b = { ...emptyCounts(), cutting: 1, onHold: 1, total: 3 }
    expect(sumCounts([a, b])).toEqual({ ...emptyCounts(), cutting: 3, onHold: 1, total: 8 })
    expect(sumCounts([])).toEqual(emptyCounts())
  })
})
