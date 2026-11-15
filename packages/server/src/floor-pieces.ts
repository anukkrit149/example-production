import { prisma, type Prisma } from '@hf/db'
import type { PieceState } from '@hf/domain'
import type { PieceListRow } from './progress'

export type FloorGroup = 'all' | 'cutting' | 'pasting' | 'stitching' | 'finishing' | 'qc' | 'packed' | 'on_hold'
export type FloorPieceRow = PieceListRow & { updatedAt: string }

/** The states a filter chip stands for. Shipped, rejected and cancelled pieces are not floor work and are never listed. */
const GROUP_STATES: Record<Exclude<FloorGroup, 'all'>, PieceState[]> = {
  cutting: ['CUT_PENDING_QA', 'CUT_OK'],
  pasting: ['WITH_PASTING', 'PASTED_PENDING_QA', 'PASTE_OK'],
  stitching: ['WITH_STITCHING', 'STITCHED_PENDING_QA', 'STITCH_OK'],
  finishing: ['WITH_FINISHING', 'FINISHED_PENDING_QA', 'FINISH_OK'],
  qc: ['QC_OK'],
  packed: ['PACKED'],
  on_hold: ['ON_HOLD'],
}
const ALL_STATES = Object.values(GROUP_STATES).flat()

function parseCursor(before: string | undefined): { at: Date; id: string } | null {
  if (!before) return null
  const i = before.indexOf('|')
  if (i < 0) return null
  const at = new Date(before.slice(0, i)); const id = before.slice(i + 1)
  return Number.isNaN(at.getTime()) || !id ? null : { at, id }
}

/** Pieces Status on the phone: active pieces, newest activity first, filtered by stage group and a code/style search. */
export async function listFloorPieces(q: { group?: FloorGroup; q?: string; before?: string; limit?: number } = {}): Promise<{ rows: FloorPieceRow[]; nextBefore: string | null }> {
  const limit = Math.min(Math.max(q.limit ?? 100, 1), 200)
  const cursor = parseCursor(q.before)
  const term = q.q?.trim()
  // Two OR clauses (search, cursor) cannot share one where object; AND-combine
  // them when both are present so neither silently overwrites the other.
  const searchOr: Prisma.PieceWhereInput[] | null = term
    ? [{ qrToken: { contains: term.toUpperCase() } }, { lineItem: { style: { styleCode: { contains: term.toUpperCase() } } } }]
    : null
  const cursorOr: Prisma.PieceWhereInput[] | null = cursor
    ? [{ updatedAt: { lt: cursor.at } }, { updatedAt: cursor.at, id: { lt: cursor.id } }]
    : null
  const where: Prisma.PieceWhereInput = {
    state: { in: q.group && q.group !== 'all' ? GROUP_STATES[q.group] : ALL_STATES },
    ...(searchOr && cursorOr
      ? { AND: [{ OR: searchOr }, { OR: cursorOr }] }
      : searchOr
        ? { OR: searchOr }
        : cursorOr
          ? { OR: cursorOr }
          : {}),
  }
  const pieces = await prisma.piece.findMany({
    where,
    include: {
      worker: { select: { name: true } },
      lineItem: { include: { style: { select: { styleCode: true } }, order: { select: { id: true, orderNumber: true } } } },
      events: { orderBy: { createdAt: 'desc' }, take: 1, select: { eventType: true, createdAt: true } },
    },
    orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
  })
  const page = pieces.slice(0, limit)
  const now = Date.now()
  const last = page[page.length - 1]
  return {
    rows: page.map((p) => {
      const ev = p.events[0]
      const since = ev?.createdAt ?? p.createdAt
      return {
        id: p.id, serial: p.serial, qrToken: p.qrToken, state: p.state, lineItemId: p.lineItemId,
        styleCode: p.lineItem.style.styleCode, size: p.lineItem.size, shade: p.lineItem.shade,
        orderNumber: p.lineItem.order.orderNumber, orderId: p.lineItem.order.id,
        worker: p.worker?.name ?? null,
        ageMinutes: Math.max(0, Math.floor((now - since.getTime()) / 60000)),
        lastEvent: ev ? { type: ev.eventType, at: ev.createdAt.toISOString() } : null,
        updatedAt: p.updatedAt.toISOString(),
      }
    }),
    nextBefore: pieces.length > limit && last ? `${last.updatedAt.toISOString()}|${last.id}` : null,
  }
}
