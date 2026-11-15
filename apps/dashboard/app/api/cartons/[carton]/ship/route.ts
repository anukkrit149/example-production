import { ShipCartonInput } from '@hf/contracts'
import { prisma } from '@hf/db'
import { ApiError, assertChecklistPassed, cartonsForOrder, handle, json, readMutation, resolveChecklistVersion, shipCarton } from '@hf/server'
import { requireUser } from '@/lib/auth'

/**
 * The ship checklist is resolved for the order's program and the category of
 * the carton's own first packed piece — not an arbitrary line item of the
 * order, which (with more than one style on the order) would resolve the
 * wrong scope non-deterministically, since a plain `take: 1` carries no
 * ordering guarantee. Same rule as the phone route (Task 7); this is the
 * office's equivalent, gated to merchandisers.
 */
export const POST = handle(async (req, ctx) => {
  const user = await requireUser(['merchandiser'])
  const { carton } = await ctx.params
  const { input, idempotencyKey } = await readMutation(req, ShipCartonInput)
  const order = await prisma.order.findUnique({ where: { id: input.orderId } })
  if (!order) throw new ApiError(404, 'order not found', 'not_found')
  const rows = await cartonsForOrder(input.orderId)
  const row = rows.find((r) => r.carton === carton.trim().toUpperCase())
  if (!row) throw new ApiError(422, `no packed piece is in carton ${carton}`, 'carton_empty')
  const firstPiece = await prisma.piece.findUniqueOrThrow({ where: { id: row.pieceIds[0] }, select: { lineItem: { select: { style: { select: { category: true } } } } } })
  const resolved = await resolveChecklistVersion({ step: 'ship', stage: null, category: firstPiece.lineItem.style.category, programId: order.programId })
  const checklist = await assertChecklistPassed({ resolved, checklist: input.checklist })
  const r = await shipCarton({ orderId: input.orderId, carton, user, idempotencyKey, attachmentIds: input.attachmentIds, details: { checklist } })
  return json(r)
})
