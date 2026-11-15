import type { ChecklistStep } from './checklist-defaults'
import type { Stage } from './piece-state'

/** The categories that have checklists. `outerwear` reads the jacket lists (see checklistCategoryFor) so it has no tab. */
export const CHECKLIST_CATEGORIES = ['jacket', 'bag', 'belt', 'slg'] as const
export type ChecklistCategory = (typeof CHECKLIST_CATEGORIES)[number]

export type TimelineRowKey = 'start' | 'cutting' | 'pasting' | 'stitching' | 'finishing' | 'qc' | 'end'
export type TimelineRow = { key: TimelineRowKey; label: string; steps: readonly ChecklistStep[] }

/**
 * The floor, top to bottom. Each row names the checklist steps that can
 * happen there; a scope that does not exist renders as an empty cell so the
 * grid keeps its shape across categories.
 */
export const TIMELINE_ROWS: readonly TimelineRow[] = [
  { key: 'start', label: 'Start', steps: ['activate'] },
  { key: 'cutting', label: 'Cutting', steps: ['qa'] },
  { key: 'pasting', label: 'Pasting', steps: ['issue', 'receive', 'qa'] },
  { key: 'stitching', label: 'Stitching', steps: ['issue', 'receive', 'qa'] },
  { key: 'finishing', label: 'Finishing', steps: ['issue', 'receive', 'qa'] },
  { key: 'qc', label: 'QC', steps: ['qa'] },
  { key: 'end', label: 'Pack & ship', steps: ['pack', 'ship'] },
]

/** Which row a (step, stage) belongs to; null for a scope the timeline does not show (nothing is seeded there). */
export function timelineRowFor(step: ChecklistStep, stage: Stage | null): TimelineRowKey | null {
  if (step === 'activate') return 'start'
  if (step === 'pack' || step === 'ship') return 'end'
  if (stage === null || stage === 'packaging') return null
  return stage
}

export type LayoutInput = { step: ChecklistStep; stage: Stage | null; category: string }
export type LayoutCell<T extends LayoutInput> = { step: ChecklistStep; checklist: T | null }
export type LayoutRow<T extends LayoutInput> = { key: TimelineRowKey; label: string; cells: LayoutCell<T>[] }

/** One category's checklists arranged on the timeline. Pure; the same rows drive the factory index and the program page. */
export function layoutChecklists<T extends LayoutInput>(lists: readonly T[], category: string): LayoutRow<T>[] {
  const mine = lists.filter((l) => l.category === category)
  return TIMELINE_ROWS.map((row) => ({
    key: row.key,
    label: row.label,
    cells: row.steps.map((step) => ({
      step,
      checklist: mine.find((l) => l.step === step && timelineRowFor(l.step, l.stage) === row.key) ?? null,
    })),
  }))
}
