import { prisma } from '@hf/db'
import { HoldInput } from '@hf/contracts'
import { ApiError, handle, json, readMutation, runPieceAction, loadPieceView } from '@hf/server'
import { requireUser } from '@/lib/auth'

/**
 * `heldFrom` is written here and nowhere else. ON_HOLD erases the piece's
 * position in the flow, so the release route has no other way to know where
 * to put it back.
 */
export const POST = handle(async (req, ctx) => {
  const user = await requireUser(['store', 'supervisor'])
  const { id } = await ctx.params
  const { input, idempotencyKey } = await readMutation(req, HoldInput)

  // Read outside the transaction's row lock: a concurrent action could move the
  // piece between here and the write. `expectedVersion` is what closes that
  // window, which is why the phone always sends the version it scanned.
  const piece = await prisma.piece.findUnique({ where: { id } })
  if (!piece) throw new ApiError(404, 'piece not found', 'not_found')

  const r = await runPieceAction({
    pieceId: id,
    user,
    idempotencyKey,
    expectedVersion: input.expectedVersion,
    event: { type: 'PIECE_HELD' },
    details: { reason: input.reason, heldFrom: piece.state },
    attachmentIds: input.attachmentIds,
  })

  return json({ piece: await loadPieceView({ id }), replayed: r.replayed })
})
