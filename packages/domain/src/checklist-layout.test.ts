import { describe, expect, it } from 'vitest'
import { DEFAULT_CHECKLISTS } from './checklist-defaults'
import { CHECKLIST_CATEGORIES, layoutChecklists, timelineRowFor, TIMELINE_ROWS } from './checklist-layout'

const seeded = DEFAULT_CHECKLISTS.map((d, i) => ({ id: `l${i}`, step: d.step, stage: d.stage, category: d.category, hasDraft: false }))

describe('layoutChecklists', () => {
  it('lays the seeded jacket lists on the seven timeline rows in floor order', () => {
    const rows = layoutChecklists(seeded, 'jacket')
    expect(rows.map((r) => r.key)).toEqual(['start', 'cutting', 'pasting', 'stitching', 'finishing', 'qc', 'end'])
    expect(rows[0]!.cells.map((c) => c.step)).toEqual(['activate'])
    expect(rows[2]!.cells.map((c) => c.step)).toEqual(['issue', 'receive', 'qa'])
    expect(rows[2]!.cells.every((c) => c.checklist !== null)).toBe(true)
    expect(rows[6]!.cells.map((c) => c.checklist?.step)).toEqual(['pack', 'ship'])
  })
  it('only includes the requested category', () => {
    const rows = layoutChecklists(seeded, 'bag')
    for (const row of rows) for (const cell of row.cells) if (cell.checklist) expect(cell.checklist.category).toBe('bag')
  })
  it('leaves a cell empty when no checklist exists for it', () => {
    const rows = layoutChecklists(seeded.filter((l) => !(l.step === 'issue' && l.stage === 'pasting')), 'jacket')
    expect(rows[2]!.cells[0]).toEqual({ step: 'issue', checklist: null })
  })
  it('places steps on the timeline', () => {
    expect(timelineRowFor('activate', null)).toBe('start')
    expect(timelineRowFor('qa', 'qc')).toBe('qc')
    expect(timelineRowFor('receive', 'stitching')).toBe('stitching')
    expect(timelineRowFor('pack', null)).toBe('end')
    expect(timelineRowFor('qa', 'packaging')).toBeNull()
  })
  it('exposes the four categories the floor uses and every row label', () => {
    expect(CHECKLIST_CATEGORIES).toEqual(['jacket', 'bag', 'belt', 'slg'])
    expect(TIMELINE_ROWS.map((r) => r.label)).toEqual(['Start', 'Cutting', 'Pasting', 'Stitching', 'Finishing', 'QC', 'Pack & ship'])
  })
})
