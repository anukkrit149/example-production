import type { StyleCategory } from './size-scales'

export type VersionCandidate = { id: string; programId: string | null; publishedAt: string | null; number: number }

/**
 * The resolution rule, pure: given every version of the default and of the
 * program's override for one (step, stage, category), pick the one a scan
 * uses. A program override wins only when it has something published; a
 * draft is invisible to the floor. Within a scope the highest published
 * number wins.
 */
export function pickChecklistVersion(candidates: VersionCandidate[]): VersionCandidate | null {
  const published = candidates.filter((c) => c.publishedAt !== null)
  const best = (list: VersionCandidate[]) => list.sort((a, b) => b.number - a.number)[0] ?? null
  const override = best(published.filter((c) => c.programId !== null))
  return override ?? best(published.filter((c) => c.programId === null))
}

/** Outerwear is a jacket for checklist purposes until it has lists of its own. */
export const checklistCategoryFor = (category: string): StyleCategory =>
  category === 'outerwear' ? 'jacket' : (category as StyleCategory)
