export type LabelStage = 'planned' | 'cutting' | 'pasting' | 'stitching' | 'finishing'
export type LabelInput = { qrToken: string; stage: LabelStage; styleCode: string; size: string; shade: string; serial: number; printDate: string }
export type LabelRow = { QR_VALUE: string; STAGE_TEXT: string; STYLE_LINE: string; DETAIL_LINE: string; QTY_LINE: string; CHECK_LINE: string; PRINT_DATE: string }

export const STAGE_TEXT: Record<LabelStage, string> = { planned: 'PLANNED', cutting: 'CUT OK', pasting: 'PASTE OK', stitching: 'STITCH OK', finishing: 'FINISH OK' }
export const STAGE_COLOR: Record<LabelStage, 'white' | 'blue' | 'red' | 'yellow' | 'green'> = { planned: 'white', cutting: 'blue', pasting: 'red', stitching: 'yellow', finishing: 'green' }
export const STAGE_TEMPLATE: Record<LabelStage, '50x25' | '50x50'> = { planned: '50x25', cutting: '50x25', pasting: '50x25', stitching: '50x25', finishing: '50x50' }

export function labelRow(i: LabelInput): LabelRow {
  return {
    QR_VALUE: i.qrToken,
    STAGE_TEXT: STAGE_TEXT[i.stage],
    STYLE_LINE: `STYLE ${i.styleCode}`,
    DETAIL_LINE: `${i.size} / ${i.shade} / ${String(i.serial).padStart(4, '0')}`,
    QTY_LINE: '1 PC',
    CHECK_LINE: 'COUNT □ SET □ QA □',
    PRINT_DATE: i.printDate,
  }
}

/**
 * Queue row -> label content. Pure so both the server (Prisma rows) and the
 * client screen (a serialised `PendingLabel` prop) can share exactly one
 * mapping without the screen importing `@hf/server` for it. `kind: 'planned'`
 * always wins over whatever `stage` happens to carry — a planned label has no
 * stage yet, and this is the one place that null is translated into the
 * `'planned'` label stage.
 */
export function labelInputFrom(
  row: { qrToken: string; kind: 'planned' | 'stage'; stage: string | null; styleCode: string; size: string; shade: string; serial: number },
  printDate = new Date().toISOString().slice(0, 10),
): LabelInput {
  return {
    qrToken: row.qrToken,
    stage: row.kind === 'planned' ? 'planned' : (row.stage as LabelStage),
    styleCode: row.styleCode,
    size: row.size,
    shade: row.shade,
    serial: row.serial,
    printDate,
  }
}
