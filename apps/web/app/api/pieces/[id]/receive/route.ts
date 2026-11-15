import { prisma } from '@hf/db'
import { ReceiveInput } from '@hf/contracts'
import { ApiError, handle, json, readMutation, runPieceAction, loadPieceView } from '@hf/server'
import { requireUser } from '@/lib/auth'
import { gate } from '@/lib/checklist-gate'

/**
 * Taking the piece back. The worker check is the point: if the operator
 * scanned the wrong worker's tray, the piece would silently leave custody of
 * someone who still physically has it. `afterWorker: null` clears custody.
 */
export const POST = handle(async (req, ctx) => {
  const user = await requireUser(['store'])
  const { id } = await ctx.params
  const { input, idempotencyKey } = await readMutation(req, ReceiveInput)

  const piece = await prisma.piece.findUnique({ where: { id } })
  if (!piece) throw new ApiError(404, 'piece not found', 'not_found')
  if (piece.workerId && piece.workerId !== input.workerId)
    throw new ApiError(422, 'this piece is with a different worker', 'wrong_worker')

  const g = await gate(id, 'receive', input.stage, input.checklist)

  const r = await runPieceAction({
    pieceId: id,
    user,
    idempotencyKey,
    expectedVersion: input.expectedVersion,
    event: { type: 'RECEIVED', stage: input.stage },
    workerId: input.workerId,
    afterWorker: null,
    groupId: input.groupId ?? null,
    details: { shortage: input.shortage ?? null, ...g },
    attachmentIds: input.attachmentIds,
  })

  return json({ piece: await loadPieceView({ id }), replayed: r.replayed })
})
