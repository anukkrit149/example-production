import { prisma, Prisma, type User } from '@hf/db'
import { ApiError } from './api'
import { runPieceAction } from './piece-action'

export type CartonRow = { carton: string; packed: number; shipped: number; pieceIds: string[]; lastPackedAt: string }

/**
 * The orders a phone can ship from right now: at least one PACKED piece, with
 * how many. Grouped by line item first because that is what `Piece.state`
 * can be filtered on directly, then rolled up to the order the operator
 * actually picks from.
 */
export async function ordersWithPacked(): Promise<Array<{ orderId: string; orderNumber: string; programName: string; packed: number }>> {
  const rows = await prisma.piece.groupBy({ by: ['lineItemId'], where: { state: 'PACKED' }, _count: { _all: true } })
  if (rows.length === 0) return []
  const lines = await prisma.orderLineItem.findMany({ where: { id: { in: rows.map((r) => r.lineItemId) } }, include: { order: { include: { program: { select: { name: true } } } } } })
  const out = new Map<string, { orderId: string; orderNumber: string; programName: string; packed: number }>()
  for (const r of rows) {
    const li = lines.find((l) => l.id === r.lineItemId)!
    const cur = out.get(li.orderId) ?? { orderId: li.orderId, orderNumber: li.order.orderNumber, programName: li.order.program.name, packed: 0 }
    cur.packed += r._count._all
    out.set(li.orderId, cur)
  }
  return [...out.values()].sort((a, b) => a.orderNumber.localeCompare(b.orderNumber))
}

/**
 * Cartons are not a table: a carton is the set of pieces whose PACKED event
 * named it. Derived here from the events of one order's pieces, newest
 * carton last, so the office and the phone read the same thing.
 */
export async function cartonsForOrder(orderId: string): Promise<CartonRow[]> {
  const events = await prisma.pieceEvent.findMany({
    where: { eventType: 'PACKED', piece: { lineItem: { orderId } } },
    orderBy: { createdAt: 'asc' },
    select: { pieceId: true, details: true, createdAt: true, piece: { select: { state: true } } },
  })
  const map = new Map<string, CartonRow>()
  for (const e of events) {
    const carton = String((e.details as { carton?: unknown })?.carton ?? '').toUpperCase()
    if (!carton) continue
    const row = map.get(carton) ?? { carton, packed: 0, shipped: 0, pieceIds: [], lastPackedAt: e.createdAt.toISOString() }
    if (!row.pieceIds.includes(e.pieceId)) {
      row.pieceIds.push(e.pieceId)
      row.packed++
      if (e.piece.state === 'SHIPPED') row.shipped++
    }
    row.lastPackedAt = e.createdAt.toISOString()
    map.set(carton, row)
  }
  return [...map.values()]
}

/**
 * One SHIPPED event per PACKED piece of the carton, in one transaction, all
 * under one idempotency key prefix — a retry replays every piece and creates
 * nothing. A carton with no PACKED piece is refused: there is nothing to
 * ship, and a typo must not succeed silently.
 *
 * Attachments are single-use rows, so the carton photo is linked to the first
 * event created here and every later event points at that event through
 * `photoSharedWithEventId` (see piece-action.ts), which satisfies the photo
 * policy without a supervisor override.
 */
export async function shipCarton(a: { orderId: string; carton: string; user: User; idempotencyKey: string; attachmentIds: string[]; details: Record<string, unknown> }): Promise<{ shipped: number; replayed: boolean }> {
  const carton = a.carton.trim().toUpperCase()
  const rows = await cartonsForOrder(a.orderId)
  const row = rows.find((r) => r.carton === carton)
  if (!row) throw new ApiError(422, `no packed piece is in carton ${carton}`, 'carton_empty')

  return prisma.$transaction(async (tx) => {
    let shipped = 0
    let firstEventId: string | null = null
    for (const pieceId of row.pieceIds) {
      const piece = await tx.piece.findUniqueOrThrow({ where: { id: pieceId } })
      if (piece.state !== 'PACKED' && piece.state !== 'SHIPPED') continue
      const r = await runPieceAction({
        tx, pieceId, user: a.user, idempotencyKey: `${a.idempotencyKey}:${pieceId}`,
        event: { type: 'SHIPPED' }, details: { ...a.details, carton },
        attachmentIds: firstEventId ? [] : a.attachmentIds,
        photoSharedWithEventId: firstEventId ?? undefined,
      })
      if (r.replayed) continue
      firstEventId ??= r.event.id
      shipped++
    }
    return shipped === 0 ? { shipped: 0, replayed: true } : { shipped, replayed: false }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted })
}
