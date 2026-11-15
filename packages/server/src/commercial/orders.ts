import { prisma, type Order } from '@hf/db'
import type { CreateOrderInput, UpdateOrderInput } from '@hf/contracts'
import { ApiError } from '../api'
import { translatePrismaError } from '../errors'
import { idempotent } from '../idempotency'
import { progressByLineItem, progressOf, piecesWhere, type PieceListRow, type Progress } from '../progress'
import type { OrderRow } from './programs'

/** A `@db.Date` column comes back as midnight UTC; the screen wants the day. */
export const isoDate = (d: Date | null): string | null => (d ? d.toISOString().slice(0, 10) : null)

/** Serialize an Order for JSON responses, converting dueDate to ISO YYYY-MM-DD. */
export const orderJson = (o: Order) => ({ ...o, dueDate: isoDate(o.dueDate) })

const toDate = (s: string | null | undefined): Date | null | undefined =>
  s === undefined ? undefined : s === null ? null : new Date(`${s}T00:00:00.000Z`)

export async function createOrder(input: CreateOrderInput, key: string) {
  const program = await prisma.program.findUnique({ where: { id: input.programId } })
  if (!program) throw new ApiError(404, 'program not found', 'not_found')
  try {
    return await idempotent({
      key,
      entity: 'order',
      run: (tx) => tx.order.create({
        data: { programId: input.programId, orderNumber: input.orderNumber, dueDate: toDate(input.dueDate) ?? null },
      }),
      reload: (tx, id) => tx.order.findUnique({ where: { id } }),
    })
  } catch (e) {
    translatePrismaError(e, { orderNumber: input.orderNumber, programName: program.name })
  }
}

export async function updateOrder(id: string, input: UpdateOrderInput): Promise<Order> {
  const existing = await prisma.order.findUnique({ where: { id }, include: { program: true } })
  if (!existing) throw new ApiError(404, 'order not found', 'not_found')
  try {
    return await prisma.order.update({
      where: { id },
      data: { ...(input.orderNumber !== undefined ? { orderNumber: input.orderNumber } : {}), ...(input.dueDate !== undefined ? { dueDate: toDate(input.dueDate) } : {}) },
    })
  } catch (e) {
    translatePrismaError(e, { orderNumber: input.orderNumber ?? existing.orderNumber, programName: existing.program.name })
  }
}

export type LineItemRow = {
  id: string; orderId: string; style: { id: string; styleCode: string; category: string }
  size: string; shade: string; quantity: number; progress: Progress
}

const orderInclude = {
  program: { include: { buyer: { select: { name: true } }, agent: { select: { name: true } } } },
  lineItems: { include: { style: { select: { id: true, styleCode: true, category: true } } }, orderBy: [{ style: { styleCode: 'asc' as const } }, { size: 'asc' as const }, { shade: 'asc' as const }] },
}

export async function listOrders(filter: { programId?: string; buyerId?: string } = {}): Promise<OrderRow[]> {
  const orders = await prisma.order.findMany({
    where: { ...(filter.programId ? { programId: filter.programId } : {}), ...(filter.buyerId ? { program: { buyerId: filter.buyerId } } : {}) },
    include: orderInclude,
    orderBy: [{ dueDate: 'asc' }, { orderNumber: 'asc' }],
  })
  const byLine = await progressByLineItem(filter.programId ? { programId: filter.programId } : {})
  const now = new Date()
  return orders.map((o) => ({
    id: o.id, orderNumber: o.orderNumber, dueDate: isoDate(o.dueDate), programId: o.programId, programName: o.program.name,
    buyerName: o.program.buyer.name, lineItemCount: o.lineItems.length, progress: progressOf(o.lineItems, byLine, o.dueDate, now),
  }))
}

export async function getOrder(id: string): Promise<(OrderRow & { agentName: string | null; lineItems: LineItemRow[] }) | null> {
  // The progress query only needs the id, so it does not wait for the order row.
  const [o, byLine] = await Promise.all([prisma.order.findUnique({ where: { id }, include: orderInclude }), progressByLineItem({ orderId: id })])
  if (!o) return null
  const now = new Date()
  return {
    id: o.id, orderNumber: o.orderNumber, dueDate: isoDate(o.dueDate), programId: o.programId, programName: o.program.name,
    buyerName: o.program.buyer.name, agentName: o.program.agent?.name ?? null, lineItemCount: o.lineItems.length,
    progress: progressOf(o.lineItems, byLine, o.dueDate, now),
    lineItems: o.lineItems.map((li) => ({
      id: li.id, orderId: li.orderId, style: li.style, size: li.size, shade: li.shade, quantity: li.quantity,
      progress: progressOf([li], byLine, o.dueDate, now),
    })),
  }
}
