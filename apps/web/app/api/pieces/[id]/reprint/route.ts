import { prisma } from '@hf/db'
import { ReprintInput } from '@hf/contracts'
import { labelStageFor } from '@hf/domain'
import { ApiError, handle, json, readMutation, runPieceAction, loadPieceView } from '@hf/server'
import { requireUser } from '@/lib/auth'

/**
 * A label that fell off or smudged. The event does not move the piece — the
 * domain returns the same state — it only records that a second label for
 * this stage was asked for, and why.
 */
export const POST = handle(async (req, ctx) => {
  const user = await requireUser(['store'])
  const { id } = await ctx.params
  const { input, idempotencyKey } = await readMutation(req, ReprintInput)

  const piece = await prisma.piece.findUnique({ where: { id } })
  if (!piece) throw new ApiError(404, 'piece not found', 'not_found')

  const stage = labelStageFor(piece.state)
  if (!stage) throw new ApiError(422, 'this piece has no label to reprint in its current state', 'no_label')

  const r = await runPieceAction({
    pieceId: id,
    user,
    idempotencyKey,
    expectedVersion: input.expectedVersion,
    event: { type: 'LABEL_REPRINT_REQUESTED', stage },
    details: { reason: input.reason },
  })

  // Guarded by `replayed` so a retried request does not queue a second label.
  if (!r.replayed)
    await prisma.labelPrint.create({
      data: {
        pieceId: id,
        stage,
        template: stage === 'finishing' ? 't50x50' : 't50x25',
        requestedById: user.id,
        reprintReason: input.reason,
      },
    })

  return json({ piece: await loadPieceView({ id }), replayed: r.replayed })
})
