import { describe, expect, it } from 'vitest'
import ExcelJS from 'exceljs'
import { labelRow } from './label-content'
import { toCsv, toXlsx, WEPRINT_COLUMNS } from './weprint'

const row = labelRow({ qrToken: 'HF-P-7K3M9Q2X', stage: 'cutting', styleCode: 'LJ-204', size: 'M', shade: 'BLK-02', serial: 7, printDate: '2026-09-03' })

describe('weprint export', () => {
  it('csv has the header and one line per row with CRLF', () => {
    const csv = toCsv([row, row])
    const lines = csv.split('\r\n')
    expect(lines[0]).toBe(WEPRINT_COLUMNS.join(','))
    expect(lines).toHaveLength(4)  // header, 2 rows, trailing empty
    expect(lines[1]).toContain('"COUNT □ SET □ QA □"')
  })
  it('xlsx has a labels sheet with the same columns', async () => {
    const bytes = await toXlsx([row])
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load(bytes.buffer as ArrayBuffer)
    const ws = wb.getWorksheet('labels')!
    expect(ws.getRow(1).values).toEqual([undefined, ...WEPRINT_COLUMNS])
    expect(ws.getRow(2).getCell(1).value).toBe('HF-P-7K3M9Q2X')
  })
})
