import { prisma, Prisma } from '@hf/db'
import { RejectInput } from '@hf/contracts'
import { generateQrToken } from '@hf/domain'
import { ApiError, handle, json, readMutation, runPieceAction, loadPieceView } from '@hf/server'
import { requireUser } from '@/lib/auth'

/** A fresh token collided with an existing one; worth exactly one more roll. */
const isTokenCollision = (e: unknown) =>
  e instanceof Prisma.PrismaClientKnownRequestError &&
  e.code === 'P2002' &&
  JSON.stringify(e.meta?.target ?? '').includes('qr_token')

/**
 * Writing a piece off, and optionally cutting its replacement.
 *
 * This is the only action that destroys value, so the role list is narrower
 * than anywhere else: a QA checker or a supervisor may reject, a store operator
 * may not. A store operator who finds a bad piece fails QA and holds it, which
 * puts the write-off in front of a second person.
 *
 * A piece still in a worker's hands cannot be rejected. Receive it first —
 * otherwise custody dangles on a piece that has left the flow for good, and the
 * worker's outstanding list never clears.
 */
export const POST = handle(async (req, ctx) => {
  const user = await requireUser(['qa', 'supervisor'])
  const { id } = await ctx.params
  const { input, idempotencyKey } = await readMutation(req, RejectInput)

  // Read outside the transaction's row lock, like the hold route: a concurrent
  // action could move the piece between here and the write, and expectedVersion
  // is what closes that window.
  const piece = await prisma.piece.findUnique({ where: { id } })
  if (!piece) throw new ApiError(404, 'piece not found', 'not_found')
  if (piece.workerId) throw new ApiError(422, 'receive this piece from the worker before rejecting it', 'in_custody')

  const r = await runPieceAction({
    pieceId: id,
    user,
    idempotencyKey,
    expectedVersion: input.expectedVersion,
    event: { type: 'PIECE_REJECTED' },
    details: { reason: input.reason, note: input.note ?? null, replace: input.replace },
    attachmentIds: input.attachmentIds,
  })

  // The replacement piece and its lineage row are created in one transaction, so
  // a rejection can never be left with a half-made replacement. A replay finds
  // the lineage row already there and returns it rather than cutting a second
  // piece; the unique index on rejected_piece_id is the backstop underneath.
  let replacement: { id: string; qrToken: string; serial: number } | null = null
  const existing = await prisma.pieceLineage.findUnique({
    where: { rejectedPieceId: id },
    include: { replacementPiece: true },
  })

  if (existing) {
    const p = existing.replacementPiece
    replacement = { id: p.id, qrToken: p.qrToken, serial: p.serial }
  } else if (input.replace && !r.replayed) {
    const cut = () =>
      prisma.$transaction(async (tx) => {
        const last = await tx.piece.findFirst({
          where: { lineItemId: piece.lineItemId },
          orderBy: { serial: 'desc' },
        })
        // Always PLANNED: the leather has to be cut again, so the replacement
        // genuinely restarts. It is a different physical object and carries its
        // own token.
        const fresh = await tx.piece.create({
          data: {
            lineItemId: piece.lineItemId,
            serial: (last?.serial ?? 0) + 1,
            qrToken: generateQrToken(),
            state: 'PLANNED',
          },
        })
        await tx.pieceLineage.create({
          data: {
            rejectedPieceId: piece.id,
            replacementPieceId: fresh.id,
            reason: input.reason,
            eventId: r.event.id,
          },
        })
        return { id: fresh.id, qrToken: fresh.qrToken, serial: fresh.serial }
      })

    try {
      replacement = await cut()
    } catch (e) {
      if (!isTokenCollision(e)) throw e
      replacement = await cut()
    }
  }

  return json({ piece: await loadPieceView({ id }), replacement, replayed: r.replayed })
})
