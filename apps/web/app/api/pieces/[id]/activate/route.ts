import { ActivateByIdInput } from '@hf/contracts'
import { handle, json, readMutation, runPieceAction, loadPieceView } from '@hf/server'
import { requireUser } from '@/lib/auth'
import { gate } from '@/lib/checklist-gate'

/** Activation from the scanned planned label: the piece is known, the cutter confirms the checklist and the lot. */
export const POST = handle(async (req, ctx) => {
  const user = await requireUser(['store'])
  const { id } = await ctx.params
  const { input, idempotencyKey } = await readMutation(req, ActivateByIdInput)
  const g = await gate(id, 'activate', null, input.checklist)
  const r = await runPieceAction({
    pieceId: id, user, idempotencyKey, expectedVersion: input.expectedVersion,
    event: { type: 'PIECE_ACTIVATED', stage: 'cutting' },
    details: { leatherLot: input.leatherLot, notes: input.notes ?? null, ...g },
    attachmentIds: input.attachmentIds,
  })
  return json({ piece: await loadPieceView({ id: r.piece.id }), replayed: r.replayed })
})
