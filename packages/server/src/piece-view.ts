import { prisma } from '@hf/db'
import {
  allowedActions,
  labelStageFor,
  normalizeQrToken,
  type Action,
  type PieceEventType,
  type PieceState,
  type Stage,
} from '@hf/domain'

/**
 * Everything a phone needs after one scan: what this piece is, where it is,
 * who has it, and — the part that matters — exactly which buttons are legal
 * right now. `actions` comes from the domain table, never from the UI's guess.
 */
export type PieceView = {
  id: string
  qrToken: string
  serial: number
  state: PieceState
  version: number
  lineItemId: string
  orderId: string
  programId: string
  styleCode: string
  category: string
  size: string
  shade: string
  orderNumber: string
  programName: string
  buyerName: string
  worker: { id: string; name: string } | null
  lastEvent: { type: PieceEventType; stage: Stage | null; at: string; by: string } | null
  /** Minutes since the last event, or since the piece was created if it has none. */
  ageMinutes: number
  actions: Action[]
  labelStage: Stage | null
}

export async function loadPieceView(where: { id: string } | { qrToken: string }): Promise<PieceView | null> {
  let w: { id: string } | { qrToken: string }
  if ('qrToken' in where) {
    // A scan may arrive lowercased or padded from the camera decoder. A token
    // that is not a token at all resolves to nothing rather than throwing.
    const token = normalizeQrToken(where.qrToken)
    if (!token) return null
    w = { qrToken: token }
  } else {
    w = where
  }

  const p = await prisma.piece.findUnique({
    where: w,
    include: {
      worker: true,
      lineItem: { include: { style: true, order: { include: { program: { include: { buyer: true } } } } } },
      events: { orderBy: { createdAt: 'desc' }, take: 1, include: { user: true } },
    },
  })
  if (!p) return null

  const last = p.events[0]
  const since = last?.createdAt ?? p.createdAt

  return {
    id: p.id,
    qrToken: p.qrToken,
    serial: p.serial,
    state: p.state,
    version: p.version,
    lineItemId: p.lineItemId,
    orderId: p.lineItem.order.id,
    programId: p.lineItem.order.program.id,
    styleCode: p.lineItem.style.styleCode,
    category: p.lineItem.style.category,
    size: p.lineItem.size,
    shade: p.lineItem.shade,
    orderNumber: p.lineItem.order.orderNumber,
    programName: p.lineItem.order.program.name,
    buyerName: p.lineItem.order.program.buyer.name,
    worker: p.worker ? { id: p.worker.id, name: p.worker.name } : null,
    lastEvent: last
      ? { type: last.eventType, stage: last.stage, at: last.createdAt.toISOString(), by: last.user.name }
      : null,
    ageMinutes: Math.max(0, Math.floor((Date.now() - since.getTime()) / 60000)),
    actions: allowedActions(p.state),
    labelStage: labelStageFor(p.state),
  }
}
