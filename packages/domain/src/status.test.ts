import { describe, expect, it } from 'vitest'
import { deriveStatus, worstStatus } from './status'

const now = new Date('2026-10-01T00:00:00Z')
const base = { total: 10, cancelled: 0, done: 0, started: 0, dueDate: null as Date | null, now }

describe('deriveStatus', () => {
  it('nothing left PLANNED', () => expect(deriveStatus(base)).toBe('not_started'))
  it('something cut', () => expect(deriveStatus({ ...base, started: 1 })).toBe('in_production'))
  it('overdue only once started and past due', () => {
    const due = new Date('2026-09-01')
    expect(deriveStatus({ ...base, started: 1, dueDate: due })).toBe('overdue')
    expect(deriveStatus({ ...base, started: 0, dueDate: due })).toBe('not_started')
    expect(deriveStatus({ ...base, started: 1, dueDate: new Date('2026-12-01') })).toBe('in_production')
  })
  it('complete when every live piece is packed or shipped', () => {
    expect(deriveStatus({ ...base, started: 10, done: 10 })).toBe('complete')
    expect(deriveStatus({ ...base, cancelled: 2, started: 8, done: 8 })).toBe('complete')
    expect(deriveStatus({ ...base, started: 10, done: 9, dueDate: new Date('2026-09-01') })).toBe('overdue')
  })
  it('a line with every piece cancelled is not complete', () => {
    expect(deriveStatus({ ...base, total: 2, cancelled: 2 })).toBe('not_started')
  })
})

describe('worstStatus', () => {
  it('ranks overdue > in_production > not_started > complete', () => {
    expect(worstStatus(['complete', 'in_production'])).toBe('in_production')
    expect(worstStatus(['not_started', 'overdue', 'complete'])).toBe('overdue')
    expect(worstStatus(['complete', 'not_started'])).toBe('not_started')
    expect(worstStatus(['complete'])).toBe('complete')
  })
  it('an empty program is not started', () => expect(worstStatus([])).toBe('not_started'))
})
