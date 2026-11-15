import type { Stage } from '@hf/domain'
import type { ChecklistAnswers } from '@hf/contracts'
import { assertChecklistPassed, resolveForPiece, type ChecklistRecord } from '@hf/server'
import type { ChecklistStep } from '@hf/domain'

/** Resolve for the piece and assert in one call; the record goes on the event as `details.checklist`. */
export async function gate(pieceId: string, step: ChecklistStep, stage: Stage | null, checklist: ChecklistAnswers, opts?: { enforceRange?: boolean }): Promise<{ checklist: ChecklistRecord }> {
  const resolved = await resolveForPiece(pieceId, step, stage)
  return { checklist: await assertChecklistPassed({ resolved, checklist }, opts) }
}
