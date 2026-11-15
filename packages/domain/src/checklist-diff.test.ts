import { describe, expect, it } from 'vitest'
import { diffChecklistItems, type DiffItem } from './checklist-diff'

const c = (textEn: string, textHi = 'ठीक', pictogram = 'inspect', kind: DiffItem['kind'] = 'confirm'): DiffItem => ({ kind, textEn, textHi, pictogram })

describe('diffChecklistItems', () => {
  it('reports nothing changed for identical lists', () => {
    const items = [c('A'), c('B')]
    expect(diffChecklistItems(items, items).map((x) => x.type)).toEqual(['unchanged', 'unchanged'])
  })
  it('finds an added item at its position', () => {
    const out = diffChecklistItems([c('A')], [c('A'), c('B')])
    expect(out[1]).toEqual({ type: 'added', to: c('B'), position: 2 })
  })
  it('finds a removed item at its old position', () => {
    const out = diffChecklistItems([c('A'), c('B')], [c('A')])
    expect(out).toContainEqual({ type: 'removed', from: c('B'), position: 2 })
  })
  it('a changed Hindi text or pictogram on the same English text is a rewording', () => {
    const out = diffChecklistItems([c('A', 'पुराना', 'inspect')], [c('A', 'नया', 'camera')])
    expect(out[0]).toMatchObject({ type: 'reworded', position: 1, fields: ['textHi', 'pictogram'] })
  })
  it('a different English text in the same slot is a rewording, not a remove plus add', () => {
    const out = diffChecklistItems([c('Both sleeves aligned')], [c('Both arms aligned')])
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ type: 'reworded', fields: ['textEn'] })
  })
  it('the same item at a new position is a move', () => {
    const out = diffChecklistItems([c('A'), c('B')], [c('B'), c('A')])
    expect(out[0]).toEqual({ type: 'moved', item: c('B'), from: 2, to: 1 })
    expect(out[1]).toEqual({ type: 'moved', item: c('A'), from: 1, to: 2 })
  })
  it('matches English text case- and whitespace-insensitively', () => {
    expect(diffChecklistItems([c('Zips aligned')], [c(' zips ALIGNED ')])[0]!.type).toBe('unchanged')
  })
})
