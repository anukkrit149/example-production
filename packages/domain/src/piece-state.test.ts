import { describe, expect, it } from 'vitest'
import { transition, type PieceState } from './piece-state'

const ok = (s: PieceState, e: Parameters<typeof transition>[1]) => {
  const r = transition(s, e); if (!r.ok) throw new Error(r.reason); return r.next
}
const fails = (s: PieceState, e: Parameters<typeof transition>[1]) => expect(transition(s, e).ok).toBe(false)

describe('happy path', () => {
  it('walks a piece from planned to packed', () => {
    let s: PieceState = 'PLANNED'
    s = ok(s, { type: 'PIECE_ACTIVATED', stage: 'cutting' });                      expect(s).toBe('CUT_PENDING_QA')
    s = ok(s, { type: 'STAGE_QA_PASSED', stage: 'cutting' });                      expect(s).toBe('CUT_OK')
    s = ok(s, { type: 'ISSUED', stage: 'pasting' });                               expect(s).toBe('WITH_PASTING')
    s = ok(s, { type: 'RECEIVED', stage: 'pasting' });                             expect(s).toBe('PASTED_PENDING_QA')
    s = ok(s, { type: 'STAGE_QA_PASSED', stage: 'pasting' });                      expect(s).toBe('PASTE_OK')
    s = ok(s, { type: 'ISSUED', stage: 'stitching' });                             expect(s).toBe('WITH_STITCHING')
    s = ok(s, { type: 'RECEIVED', stage: 'stitching' });                           expect(s).toBe('STITCHED_PENDING_QA')
    s = ok(s, { type: 'STAGE_QA_PASSED', stage: 'stitching' });                    expect(s).toBe('STITCH_OK')
    s = ok(s, { type: 'ISSUED', stage: 'finishing' });                             expect(s).toBe('WITH_FINISHING')
    s = ok(s, { type: 'RECEIVED', stage: 'finishing' });                           expect(s).toBe('FINISHED_PENDING_QA')
    s = ok(s, { type: 'STAGE_QA_PASSED', stage: 'finishing' });                    expect(s).toBe('FINISH_OK')
    s = ok(s, { type: 'STAGE_QA_PASSED', stage: 'qc' });                           expect(s).toBe('QC_OK')
    s = ok(s, { type: 'PACKED', stage: 'packaging' });                             expect(s).toBe('PACKED')
    s = ok(s, { type: 'SHIPPED' });                                                expect(s).toBe('SHIPPED')
  })
})

describe('rules', () => {
  it('forbids skipping a stage', () => {
    fails('CUT_OK', { type: 'ISSUED', stage: 'stitching' })
    fails('CUT_OK', { type: 'STAGE_QA_PASSED', stage: 'pasting' })
  })
  it('forbids issuing before QA passes', () => {
    fails('CUT_PENDING_QA', { type: 'ISSUED', stage: 'pasting' })
    fails('PASTED_PENDING_QA', { type: 'ISSUED', stage: 'stitching' })
  })
  it('QA fail keeps the piece at the same checkpoint', () => {
    expect(ok('CUT_PENDING_QA', { type: 'STAGE_QA_FAILED', stage: 'cutting' })).toBe('CUT_PENDING_QA')
    expect(ok('STITCHED_PENDING_QA', { type: 'STAGE_QA_FAILED', stage: 'stitching' })).toBe('STITCHED_PENDING_QA')
  })
  it('rework sends the piece back to the worker of that stage', () => {
    expect(ok('PASTED_PENDING_QA', { type: 'REWORK_ASSIGNED', stage: 'pasting' })).toBe('WITH_PASTING')
    fails('CUT_PENDING_QA', { type: 'REWORK_ASSIGNED', stage: 'pasting' })
  })
  it('hold and release round-trip', () => {
    expect(ok('CUT_OK', { type: 'PIECE_HELD' })).toBe('ON_HOLD')
    expect(ok('ON_HOLD', { type: 'PIECE_RELEASED', returnTo: 'CUT_OK' })).toBe('CUT_OK')
    fails('ON_HOLD', { type: 'ISSUED', stage: 'pasting' })
    fails('ON_HOLD', { type: 'PIECE_RELEASED' })
  })
  it('planned pieces can only be activated or cancelled', () => {
    expect(ok('PLANNED', { type: 'PIECE_CANCELLED' })).toBe('CANCELLED')
    fails('PLANNED', { type: 'STAGE_QA_PASSED', stage: 'cutting' })
    fails('PLANNED', { type: 'ISSUED', stage: 'pasting' })
  })
  it('terminal states accept nothing', () => {
    for (const s of ['CANCELLED', 'REJECTED', 'SHIPPED'] as const) {
      fails(s, { type: 'ISSUED', stage: 'pasting' })
      fails(s, { type: 'PIECE_HELD' })
    }
  })
  it('reject is allowed from any pending-QA or QA-passed state', () => {
    for (const s of ['CUT_PENDING_QA', 'CUT_OK', 'STITCHED_PENDING_QA', 'FINISH_OK'] as const) {
      expect(ok(s, { type: 'PIECE_REJECTED' })).toBe('REJECTED')
    }
    fails('WITH_PASTING', { type: 'PIECE_REJECTED' })
  })
  it('label events never change state', () => {
    expect(ok('CUT_OK', { type: 'LABEL_PRINT_REQUESTED', stage: 'cutting' })).toBe('CUT_OK')
    expect(ok('PASTE_OK', { type: 'LABEL_REPRINT_REQUESTED', stage: 'pasting' })).toBe('PASTE_OK')
    fails('CUT_OK', { type: 'LABEL_PRINT_REQUESTED', stage: 'pasting' })
  })
})
