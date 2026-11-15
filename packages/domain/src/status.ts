export type DerivedStatus = 'not_started' | 'in_production' | 'overdue' | 'complete'

/**
 * One status word for an order or program, computed from piece counts and a
 * due date, never stored. `done` is pieces at or past packaging; `started` is
 * pieces that have left PLANNED (STARTED_STATES). A rejected piece that was
 * never replaced keeps its order in production — the ordered quantity has not
 * been met, and that is worth seeing.
 */
export function deriveStatus(i: {
  total: number
  cancelled: number
  done: number
  started: number
  dueDate: Date | null
  now: Date
}): DerivedStatus {
  const live = i.total - i.cancelled
  if (live > 0 && i.done >= live) return 'complete'
  if (i.started === 0) return 'not_started'
  if (i.dueDate && i.dueDate.getTime() < i.now.getTime()) return 'overdue'
  return 'in_production'
}

const SEVERITY: Record<DerivedStatus, number> = { overdue: 3, in_production: 2, not_started: 1, complete: 0 }

/** A program is as bad as its worst order. */
export function worstStatus(list: DerivedStatus[]): DerivedStatus {
  let worst: DerivedStatus = 'not_started'
  let first = true
  for (const s of list) {
    if (first || SEVERITY[s] > SEVERITY[worst]) worst = s
    first = false
  }
  return worst
}
