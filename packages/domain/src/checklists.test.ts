import { describe, expect, it } from 'vitest'
import { checklistCategoryFor, pickChecklistVersion } from './checklists'

const v = (id: string, programId: string | null, publishedAt: string | null, number = 1) => ({ id, programId, publishedAt, number })

describe('pickChecklistVersion', () => {
  it('prefers the program override when it has a published version', () => {
    expect(pickChecklistVersion([v('d1', null, '2026-01-01'), v('p1', 'prog', '2026-02-01')])?.id).toBe('p1')
  })
  it('ignores an override that only has a draft', () => {
    expect(pickChecklistVersion([v('d1', null, '2026-01-01'), v('p1', 'prog', null)])?.id).toBe('d1')
  })
  it('takes the highest published number within a scope', () => {
    expect(pickChecklistVersion([v('d1', null, '2026-01-01', 1), v('d2', null, '2026-03-01', 2), v('d3', null, null, 3)])?.id).toBe('d2')
  })
  it('returns null with nothing published', () => {
    expect(pickChecklistVersion([v('d3', null, null)])).toBeNull()
  })
})

describe('checklistCategoryFor', () => {
  it('outerwear uses the jacket lists', () => expect(checklistCategoryFor('outerwear')).toBe('jacket'))
  it('others map to themselves', () => expect(checklistCategoryFor('bag')).toBe('bag'))
})
