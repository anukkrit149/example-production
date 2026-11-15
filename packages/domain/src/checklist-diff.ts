import type { ChecklistItemKind } from './checklist-defaults'

export type DiffItem = { kind: ChecklistItemKind; textEn: string; textHi: string; pictogram: string; unit?: string | null; min?: number | null; max?: number | null }
export type DiffField = 'kind' | 'textEn' | 'textHi' | 'pictogram' | 'unit' | 'min' | 'max'
export type ItemChange =
  | { type: 'unchanged'; item: DiffItem; position: number }
  | { type: 'added'; to: DiffItem; position: number }
  | { type: 'removed'; from: DiffItem; position: number }
  | { type: 'reworded'; from: DiffItem; to: DiffItem; position: number; fields: DiffField[] }
  | { type: 'moved'; item: DiffItem; from: number; to: number }

const FIELDS: readonly DiffField[] = ['kind', 'textEn', 'textHi', 'pictogram', 'unit', 'min', 'max']
const key = (i: DiffItem) => i.textEn.trim().toLowerCase()
const norm = (v: unknown) => (v === undefined || v === null || v === '' ? null : v)
const changed = (a: DiffItem, b: DiffItem): DiffField[] => FIELDS.filter((f) => (f === 'textEn' ? key(a) !== key(b) : norm(a[f]) !== norm(b[f])))

/**
 * What publishing would change, item by item, for the review screen.
 *
 * An item is "the same item" when its English text matches (trimmed,
 * case-insensitive). A draft item with new English text sitting in a slot
 * whose published item was not kept anywhere else is a rewording of that
 * item, not a remove plus an add — that is how an admin fixes a sentence.
 * Positions are 1-based because they are shown to people.
 */
export function diffChecklistItems(published: readonly DiffItem[], draft: readonly DiffItem[]): ItemChange[] {
  const claimed = new Set<number>()
  const firstIndex = new Map<string, number>()
  published.forEach((p, i) => { if (!firstIndex.has(key(p))) firstIndex.set(key(p), i) })
  const draftKeys = new Set(draft.map(key))

  const out: ItemChange[] = []
  draft.forEach((d, di) => {
    const pi = firstIndex.get(key(d))
    if (pi !== undefined && !claimed.has(pi)) {
      claimed.add(pi)
      const p = published[pi]!
      const fields = changed(p, d)
      if (fields.length > 0) out.push({ type: 'reworded', from: p, to: d, position: di + 1, fields })
      else if (pi !== di) out.push({ type: 'moved', item: d, from: pi + 1, to: di + 1 })
      else out.push({ type: 'unchanged', item: d, position: di + 1 })
      return
    }
    const slot = published[di]
    if (slot && !claimed.has(di) && !draftKeys.has(key(slot))) {
      claimed.add(di)
      out.push({ type: 'reworded', from: slot, to: d, position: di + 1, fields: changed(slot, d) })
      return
    }
    out.push({ type: 'added', to: d, position: di + 1 })
  })
  published.forEach((p, pi) => { if (!claimed.has(pi)) out.push({ type: 'removed', from: p, position: pi + 1 }) })
  return out
}
