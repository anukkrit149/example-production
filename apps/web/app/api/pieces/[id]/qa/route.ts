import { SubmitQaInput } from '@hf/contracts'
import { handle, json, readMutation, runPieceAction, loadPieceView } from '@hf/server'
import { requireUser } from '@/lib/auth'
import { gate } from '@/lib/checklist-gate'

/**
 * A pass moves the piece on and (inside runPieceAction) queues the stage
 * label. A fail leaves the state exactly where it was — the piece is still
 * waiting for the same QA — but the defect codes are on the record forever.
 * Only a pass is checklist-gated: a fail may carry the checklist too, but its
 * values are recorded as evidence of what was measured, not certified against
 * the range — that is why the QA was failed in the first place.
 */
export const POST = handle(async (req, ctx) => {
  const user = await requireUser(['qa', 'store'])
  const { id } = await ctx.params
  const { input, idempotencyKey } = await readMutation(req, SubmitQaInput)

  const g = input.result === 'pass'
    ? await gate(id, 'qa', input.stage, input.checklist!)
    : input.checklist ? await gate(id, 'qa', input.stage, input.checklist, { enforceRange: false }) : {}

  const r = await runPieceAction({
    pieceId: id,
    user,
    idempotencyKey,
    expectedVersion: input.expectedVersion,
    event: { type: input.result === 'pass' ? 'STAGE_QA_PASSED' : 'STAGE_QA_FAILED', stage: input.stage },
    details: { result: input.result, defectCodes: input.defectCodes, notes: input.notes ?? null, ...g },
    attachmentIds: input.attachmentIds,
  })

  return json({ piece: await loadPieceView({ id }), replayed: r.replayed })
})
