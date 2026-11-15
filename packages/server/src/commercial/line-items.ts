import { prisma, Prisma, type OrderLineItem, type User } from '@hf/db'
import type { ChangeQuantityInput, CreateLineItemInput } from '@hf/contracts'
import { generateQrToken, isValidSize, sizesFor } from '@hf/domain'
import { ApiError } from '../api'
import { isUniqueViolation, translatePrismaError } from '../errors'
import { idempotent } from '../idempotency'
import { requestPlannedLabels, voidUnprintedPlannedLabels } from '../labels'
import { runPieceAction } from '../piece-action'
import { progressByLineItem, progressOf, piecesWhere, type PieceListRow } from '../progress'
import type { LineItemRow } from './orders'

/** Distinct random tokens. Distinct within the batch here; distinct in the table by the unique index. */
export function freshTokens(n: number): string[] {
  const set = new Set<string>()
  while (set.size < n) set.add(generateQrToken())
  return [...set]
}

const TOKEN_ATTEMPTS = 3

/**
 * The handover from office to floor.
 *
 * One transaction inserts the line item and every one of its pieces as PLANNED,
 * serials 1..quantity, each with a permanent QR token. Until this runs the
 * checkpoint app has nothing to activate; after it, the pieces are real. A
 * line item can never exist with fewer pieces than its quantity, because both
 * writes commit together or not at all.
 *
 * A token collision across the whole table is a one-in-a-trillion event per
 * token; when it happens the transaction has already rolled back, so the
 * whole thing is simply retried with new tokens.
 */
export async function createLineItem(input: CreateLineItemInput, key: string, userId: string): Promise<{ lineItem: OrderLineItem; plannedCount: number; replayed: boolean }> {
  const [order, style] = await Promise.all([
    prisma.order.findUnique({ where: { id: input.orderId } }),
    prisma.style.findUnique({ where: { id: input.styleId } }),
  ])
  if (!order) throw new ApiError(404, 'order not found', 'not_found')
  if (!style || !style.active) throw new ApiError(422, 'style not available', 'invalid_style')
  if (!isValidSize(style.category, input.size))
    throw new ApiError(422, `size ${input.size} is not valid for a ${style.category}; use ${sizesFor(style.category).join(', ')}`, 'invalid_size')

  for (let attempt = 1; ; attempt++) {
    try {
      const { result, replayed } = await idempotent({
        key,
        entity: 'line_item',
        run: async (tx) => {
          const li = await tx.orderLineItem.create({
            data: { orderId: input.orderId, styleId: input.styleId, size: input.size, shade: input.shade, quantity: input.quantity },
          })
          const tokens = freshTokens(input.quantity)
          await tx.piece.createMany({ data: tokens.map((qrToken, i) => ({ lineItemId: li.id, serial: i + 1, qrToken })) })
          const created = await tx.piece.findMany({ where: { lineItemId: li.id }, select: { id: true } })
          await requestPlannedLabels(tx, created.map((p) => p.id), userId)
          return li
        },
        reload: (tx, id) => tx.orderLineItem.findUnique({ where: { id } }),
      })
      const plannedCount = await prisma.piece.count({ where: { lineItemId: result.id, state: 'PLANNED' } })
      return { lineItem: result, plannedCount, replayed }
    } catch (e) {
      if (isUniqueViolation(e, 'qr_token') && attempt < TOKEN_ATTEMPTS) continue
      translatePrismaError(e, { styleCode: style.styleCode, size: input.size, shade: input.shade, orderNumber: order.orderNumber })
    }
  }
}

/**
 * Raise or lower a line item's quantity after its pieces exist.
 *
 * One transaction, holding `SELECT ... FOR UPDATE` on the line item so two
 * office users cannot race each other. Increasing appends PLANNED pieces with
 * serials continuing from the highest existing one. Decreasing cancels the
 * highest-serial PLANNED pieces — through runPieceAction, so each cancellation
 * is an append-only event with the reason — and refuses to go below the
 * number of pieces that have already been cut. Nothing that has left PLANNED
 * is ever touched here.
 */
export async function changeQuantity(a: {
  lineItemId: string
  input: ChangeQuantityInput
  user: User
  idempotencyKey: string
}): Promise<{ lineItem: OrderLineItem; added: number; cancelled: number; replayed: boolean }> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          const seen = await tx.mutationKey.findUnique({ where: { key: a.idempotencyKey } })
          if (seen && seen.entity === 'line_item_quantity') {
            const li = await tx.orderLineItem.findUniqueOrThrow({ where: { id: seen.entityId } })
            return { lineItem: li, added: 0, cancelled: 0, replayed: true }
          }

          const locked = await tx.$queryRaw<Array<{ id: string }>>`
            SELECT id FROM order_line_items WHERE id = ${a.lineItemId}::uuid FOR UPDATE`
          if (locked.length === 0) throw new ApiError(404, 'line item not found', 'not_found')

          const li = await tx.orderLineItem.findUniqueOrThrow({ where: { id: a.lineItemId } })
          const pieces = await tx.piece.findMany({
            where: { lineItemId: li.id },
            select: { id: true, serial: true, state: true },
            orderBy: { serial: 'desc' },
          })
          const activated = pieces.filter((p) => p.state !== 'PLANNED' && p.state !== 'CANCELLED').length
          const planned = pieces.filter((p) => p.state === 'PLANNED')   // highest serial first
          const target = a.input.quantity
          const delta = target - li.quantity

          let added = 0
          let cancelled = 0

          if (delta > 0) {
            const maxSerial = pieces[0]?.serial ?? 0
            const tokens = freshTokens(delta)
            await tx.piece.createMany({ data: tokens.map((qrToken, i) => ({ lineItemId: li.id, serial: maxSerial + 1 + i, qrToken })) })
            const added_ = await tx.piece.findMany({ where: { lineItemId: li.id, serial: { gt: maxSerial } }, select: { id: true } })
            await requestPlannedLabels(tx, added_.map((p) => p.id), a.user.id)
            added = delta
          } else if (delta < 0) {
            if (target < activated)
              throw new ApiError(422, `${activated} pieces are already cut; quantity cannot go below ${activated}`, 'below_activated')
            const reason = a.input.reason?.trim()
            if (!reason) throw new ApiError(422, 'a reason is needed to cancel planned pieces', 'reason_required')
            for (const p of planned.slice(0, -delta)) {
              await runPieceAction({
                tx,
                pieceId: p.id,
                user: a.user,
                idempotencyKey: `${a.idempotencyKey}:${p.id}`,
                event: { type: 'PIECE_CANCELLED' },
                details: { reason, quantityFrom: li.quantity, quantityTo: target },
              })
              cancelled++
            }
            await voidUnprintedPlannedLabels(tx, planned.slice(0, -delta).map((p) => p.id))
          }

          const lineItem = delta === 0 ? li : await tx.orderLineItem.update({ where: { id: li.id }, data: { quantity: target } })
          await tx.mutationKey.create({ data: { key: a.idempotencyKey, entity: 'line_item_quantity', entityId: li.id } })
          return { lineItem, added, cancelled, replayed: false }
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
      )
    } catch (e) {
      if (isUniqueViolation(e, 'qr_token') && attempt < TOKEN_ATTEMPTS) continue
      throw e
    }
  }
}

export async function getLineItem(id: string): Promise<(LineItemRow & { orderNumber: string; programId: string; programName: string; pieces: PieceListRow[] }) | null> {
  const li = await prisma.orderLineItem.findUnique({
    where: { id },
    include: { style: { select: { id: true, styleCode: true, category: true } }, order: { include: { program: { select: { id: true, name: true } } } } },
  })
  if (!li) return null
  const [byLine, pieces] = await Promise.all([progressByLineItem({ lineItemIds: [id] }), piecesWhere({ lineItemId: id })])
  return {
    id: li.id, orderId: li.orderId, style: li.style, size: li.size, shade: li.shade, quantity: li.quantity,
    progress: progressOf([li], byLine, li.order.dueDate, new Date()),
    orderNumber: li.order.orderNumber, programId: li.order.program.id, programName: li.order.program.name, pieces,
  }
}
