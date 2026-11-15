import { prisma } from '@hf/db'
import { ActivatePieceInput } from '@hf/contracts'
import { ApiError, handle, json, readMutation, runPieceAction, loadPieceView } from '@hf/server'
import { requireUser } from '@/lib/auth'
import { gate } from '@/lib/checklist-gate'

/**
 * Activation is the one action addressed by line item rather than by piece:
 * the operator has cut a panel set and needs the next label, not a particular
 * serial. An explicit `serial` overrides that when a label already exists.
 */
export const POST = handle(async (req) => {
  const user = await requireUser(['store'])
  const { input, idempotencyKey } = await readMutation(req, ActivatePieceInput)

  const piece = await prisma.piece.findFirst({
    where: {
      lineItemId: input.lineItemId,
      state: 'PLANNED',
      ...(input.serial !== undefined ? { serial: input.serial } : {}),
    },
    orderBy: { serial: 'asc' },
  })
  if (!piece) throw new ApiError(422, 'no planned piece left on this line item', 'no_planned_piece')

  const g = await gate(piece.id, 'activate', null, input.checklist)

  const r = await runPieceAction({
    pieceId: piece.id,
    user,
    idempotencyKey,
    expectedVersion: input.expectedVersion,
    event: { type: 'PIECE_ACTIVATED', stage: 'cutting' },
    details: { leatherLot: input.leatherLot, notes: input.notes ?? null, ...g },
    attachmentIds: input.attachmentIds,
  })

  return json({ piece: await loadPieceView({ id: r.piece.id }), replayed: r.replayed })
})
