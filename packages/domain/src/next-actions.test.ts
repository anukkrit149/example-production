import { describe, expect, it } from 'vitest'
import { allowedActions, labelStageFor, nextCustodyStage, stageForState } from './next-actions'

describe('allowedActions', () => {
  it('matches the spec table', () => {
    expect(allowedActions('PLANNED')).toEqual(['activate', 'cancel'])
    expect(allowedActions('CUT_PENDING_QA')).toEqual(['submit_qa', 'reject'])
    expect(allowedActions('CUT_OK')).toEqual(['issue', 'reprint', 'hold', 'reject'])
    expect(allowedActions('WITH_PASTING')).toEqual(['receive', 'hold'])
    expect(allowedActions('FINISH_OK')).toEqual(['submit_qa', 'reprint', 'hold', 'reject'])
    expect(allowedActions('QC_OK')).toEqual(['pack', 'hold'])
    expect(allowedActions('ON_HOLD')).toEqual(['release'])
    expect(allowedActions('SHIPPED')).toEqual([])
  })
})

describe('stage helpers', () => {
  it('maps states to stages', () => {
    expect(stageForState('CUT_PENDING_QA')).toBe('cutting')
    expect(stageForState('WITH_STITCHING')).toBe('stitching')
    expect(stageForState('FINISH_OK')).toBe('qc')
    expect(stageForState('QC_OK')).toBe('packaging')
    expect(stageForState('ON_HOLD')).toBeNull()
  })
  it('maps QA-passed states to the label they carry', () => {
    expect(labelStageFor('CUT_OK')).toBe('cutting')
    expect(labelStageFor('FINISH_OK')).toBe('finishing')
    expect(labelStageFor('QC_OK')).toBeNull()
    expect(labelStageFor('WITH_PASTING')).toBeNull()
  })
  it('knows the next custody stage', () => {
    expect(nextCustodyStage('CUT_OK')).toBe('pasting')
    expect(nextCustodyStage('STITCH_OK')).toBe('finishing')
    expect(nextCustodyStage('FINISH_OK')).toBeNull()
  })
})
