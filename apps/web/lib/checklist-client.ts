import type { Action, ChecklistStep, Stage } from '@hf/domain'
import type { ResolvedChecklist } from '@hf/server'

export type StepAction = Extract<Action, 'activate' | 'submit_qa' | 'issue' | 'receive' | 'pack'> | 'ship'

/** Which checklist a phone action uses. Stage is the piece's current stage for QA and receive, the next custody stage for issue. */
export function stepFor(action: StepAction, state: { stage: Stage | null; nextCustody: Stage | null }): { step: ChecklistStep; stage: Stage | null } {
  switch (action) {
    case 'activate': return { step: 'activate', stage: null }
    case 'submit_qa': return { step: 'qa', stage: state.stage }
    case 'issue': return { step: 'issue', stage: state.nextCustody }
    case 'receive': return { step: 'receive', stage: state.stage }
    case 'pack': return { step: 'pack', stage: null }
    case 'ship': return { step: 'ship', stage: null }
  }
}

export async function fetchChecklist(pieceId: string, step: ChecklistStep, stage: Stage | null): Promise<ResolvedChecklist | null> {
  const q = new URLSearchParams({ pieceId, step, ...(stage ? { stage } : {}) })
  const res = await fetch(`/api/checklists?${q}`)
  if (!res.ok) throw new Error('checklist unavailable')
  return (await res.json()).checklist
}

export type Answer = { itemId: string; value: true | number; materials?: Array<{ code: string; qty: number; unit: string }> }
export const answersPayload = (versionId: string, answers: Answer[]) => ({ versionId, answers })

/**
 * The photo an item is currently answered with, keyed by that item.
 *
 * A list is the wrong shape here: the operator can walk back to a photo item
 * and say YES again, or retake the shot before saying it at all, and appending
 * would send the same attachment twice or send the discarded one alongside its
 * replacement. Keyed by item, the second answer replaces the first, which is
 * what "this item's photo" means.
 */
export type PhotoMap = Record<string, string>

export const withPhoto = (photos: PhotoMap, itemId: string, photoId: string | undefined): PhotoMap => {
  if (!photoId) {
    // Answering an item that no longer carries a photo drops the one it had.
    if (!(itemId in photos)) return photos
    return Object.fromEntries(Object.entries(photos).filter(([k]) => k !== itemId))
  }
  if (photos[itemId] === photoId) return photos
  return { ...photos, [itemId]: photoId }
}

/** The order the operator took them in, deduplicated by construction. */
export const attachmentIds = (photos: PhotoMap): string[] => Object.values(photos)
