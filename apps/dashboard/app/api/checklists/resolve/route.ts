import { prisma } from '@hf/db'
import { ApiError, cartonsForOrder, handle, json, resolveChecklistVersion } from '@hf/server'
import { requireUser } from '@/lib/auth'

/**
 * The ship checklist for the drawer, resolved server-side so the office
 * cannot answer a stale or hand-picked list. `carton` (when given) pins the
 * category to that carton's own first packed piece — same rule as the ship
 * route itself. With no carton yet chosen (or nothing packed into it), this
 * falls back to the order's first line item's style category, which is only
 * ever a preview: the ship route resolves again, from the carton, before it
 * ships anything.
 */
export const GET = handle(async (req) => {
  await requireUser()
  const url = new URL(req.url)
  const orderId = url.searchParams.get('orderId')
  if (!orderId) throw new ApiError(400, 'orderId is required', 'validation')
  const carton = url.searchParams.get('carton')

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      programId: true,
      // Deterministic "first line item": same ordering as getOrder's own
      // include, so this preview and the order page agree on which style it
      // means. A plain `take: 1` with no orderBy carries no such guarantee.
      lineItems: { take: 1, orderBy: [{ style: { styleCode: 'asc' } }, { size: 'asc' }, { shade: 'asc' }], select: { style: { select: { category: true } } } },
    },
  })
  if (!order) throw new ApiError(404, 'order not found', 'not_found')

  let category = order.lineItems[0]?.style.category ?? null
  if (carton) {
    const rows = await cartonsForOrder(orderId)
    const row = rows.find((r) => r.carton === carton.trim().toUpperCase())
    if (row) {
      const firstPiece = await prisma.piece.findUniqueOrThrow({ where: { id: row.pieceIds[0] }, select: { lineItem: { select: { style: { select: { category: true } } } } } })
      category = firstPiece.lineItem.style.category
    }
  }
  if (!category) return json({ checklist: null })

  const checklist = await resolveChecklistVersion({ step: 'ship', stage: null, category, programId: order.programId })
  return json({ checklist })
})
