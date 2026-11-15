import { prisma } from '@hf/db'
import { ReleaseInput } from '@hf/contracts'
import type { PieceState } from '@hf/domain'
import { ApiError, handle, json, readMutation, runPieceAction, loadPieceView } from '@hf/server'
import { requireUser } from '@/lib/auth'

/**
 * Only a supervisor may take a piece off hold, and only back to the state it
 * was held from. That state lives in the most recent PIECE_HELD event; if
 * there is none, there is nothing to release.
 */
export const POST = handle(async (req, ctx) => {
  const user = await requireUser(['supervisor'])
  const { id } = await ctx.params
  const { input, idempotencyKey } = await readMutation(req, ReleaseInput)

  const held = await prisma.pieceEvent.findFirst({
    where: { pieceId: id, eventType: 'PIECE_HELD' },
    orderBy: { createdAt: 'desc' },
  })
  const returnTo = (held?.details as { heldFrom?: PieceState } | null)?.heldFrom
  if (!returnTo) throw new ApiError(422, 'no hold to release', 'not_held')

  const r = await runPieceAction({
    pieceId: id,
    user,
    idempotencyKey,
    expectedVersion: input.expectedVersion,
    event: { type: 'PIECE_RELEASED', returnTo },
    details: { reason: input.reason },
    attachmentIds: input.attachmentIds,
  })

  return json({ piece: await loadPieceView({ id }), replayed: r.replayed })
})
