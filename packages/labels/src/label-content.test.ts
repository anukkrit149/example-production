import { describe, expect, it } from 'vitest'
import { labelRow, STAGE_COLOR, STAGE_TEXT, STAGE_TEMPLATE } from './label-content'

describe('labelRow', () => {
  it('maps a piece to the PRD columns', () => {
    const r = labelRow({ qrToken: 'HF-P-7K3M9Q2X', stage: 'cutting', styleCode: 'LJ-204', size: 'M', shade: 'BLK-02', serial: 7, printDate: '2026-09-03' })
    expect(r).toEqual({
      QR_VALUE: 'HF-P-7K3M9Q2X', STAGE_TEXT: 'CUT OK', STYLE_LINE: 'STYLE LJ-204', DETAIL_LINE: 'M / BLK-02 / 0007',
      QTY_LINE: '1 PC', CHECK_LINE: 'COUNT □ SET □ QA □', PRINT_DATE: '2026-09-03',
    })
  })
  it('uses the right stage text and colour', () => {
    expect(labelRow({ qrToken: 'HF-P-AAAAAAAA', stage: 'finishing', styleCode: 'TB-018', size: 'ONE', shade: 'TAN-01', serial: 1, printDate: '2026-09-03' }).STAGE_TEXT).toBe('FINISH OK')
    expect(STAGE_COLOR.finishing).toBe('green')
    expect(STAGE_COLOR.pasting).toBe('red')
  })
  it('a planned label says PLANNED on white 50x25 stock', () => {
    expect(STAGE_TEXT.planned).toBe('PLANNED')
    expect(STAGE_COLOR.planned).toBe('white')
    expect(STAGE_TEMPLATE.planned).toBe('50x25')
    const row = labelRow({ qrToken: 'HF-P-ABCDEFGH', stage: 'planned', styleCode: 'LJ-204', size: 'M', shade: 'BLK-02', serial: 7, printDate: '2026-09-05' })
    expect(row.STAGE_TEXT).toBe('PLANNED')
    expect(row.DETAIL_LINE).toBe('M / BLK-02 / 0007')
  })
})
