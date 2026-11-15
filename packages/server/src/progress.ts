import { prisma, type Prisma } from '@hf/db'
import {
  AT_OR_PAST, deriveStatus, emptyCounts, stageCountsFromRows, sumCounts,
  type DerivedStatus, type PieceEventType, type PieceState, type Stage, type StageCounts,
} from '@hf/domain'

/** The page has to stop somewhere; see `piecesWhere`'s cap for why 2000. Shared with the `/pieces` page's notice text. */
export const PIECE_LIST_CAP = 2000

export type Progress = { counts: StageCounts; replaced: number; ordered: number; status: DerivedStatus }

export type PieceFilter = { lineItemId?: string; orderId?: string; programId?: string; atOrPast?: Stage; state?: PieceState }

export type PieceListRow = {
  id: string
  serial: number
  qrToken: string
  state: PieceState
  lineItemId: string
  styleCode: string
  size: string
  shade: string
  orderNumber: string
  orderId: string
  worker: string | null
  ageMinutes: number
  lastEvent: { type: PieceEventType; at: string } | null
}

/**
 * One grouped query for a whole scope, then folded per line item.
 *
 * `groupBy` over (line_item_id, state) is a single round trip however many
 * pieces the program has; the fold into six at-or-past numbers is the pure
 * function in @hf/domain. `replaced` is a second small query over lineage.
 */
export async function progressByLineItem(scope: { lineItemIds?: string[]; orderId?: string; programId?: string }) {
  const where: Prisma.PieceWhereInput = scope.lineItemIds
    ? { lineItemId: { in: scope.lineItemIds } }
    : scope.orderId
      ? { lineItem: { orderId: scope.orderId } }
      : scope.programId
        ? { lineItem: { order: { programId: scope.programId } } }
        : {}

  const [grouped, lineage] = await Promise.all([
    prisma.piece.groupBy({ by: ['lineItemId', 'state'], where, _count: { _all: true } }),
    prisma.pieceLineage.findMany({ where: { replacementPiece: where }, select: { replacementPiece: { select: { lineItemId: true } } } }),
  ])

  const rows = new Map<string, Array<{ state: PieceState; count: number }>>()
  for (const g of grouped) {
    const list = rows.get(g.lineItemId) ?? []
    list.push({ state: g.state, count: g._count._all })
    rows.set(g.lineItemId, list)
  }
  const replaced = new Map<string, number>()
  for (const l of lineage) replaced.set(l.replacementPiece.lineItemId, (replaced.get(l.replacementPiece.lineItemId) ?? 0) + 1)

  const out = new Map<string, { counts: StageCounts; replaced: number }>()
  for (const id of new Set([...rows.keys(), ...replaced.keys(), ...(scope.lineItemIds ?? [])]))
    out.set(id, { counts: stageCountsFromRows(rows.get(id) ?? []), replaced: replaced.get(id) ?? 0 })
  return out
}

/** Roll a set of line items up into one Progress with a derived status. */
export function progressOf(
  lineItems: Array<{ id: string; quantity: number }>,
  byLine: Map<string, { counts: StageCounts; replaced: number }>,
  dueDate: Date | null,
  now: Date,
): Progress {
  const parts = lineItems.map((li) => byLine.get(li.id) ?? { counts: emptyCounts(), replaced: 0 })
  const counts = sumCounts(parts.map((p) => p.counts))
  const replaced = parts.reduce((n, p) => n + p.replaced, 0)
  const ordered = lineItems.reduce((n, li) => n + li.quantity, 0)
  const started = counts.total - counts.cancelled - counts.planned
  const status = deriveStatus({ total: counts.total, cancelled: counts.cancelled, done: counts.packaging, started, dueDate, now })
  return { counts, replaced, ordered, status }
}

/**
 * The single predicate table shared by counts and lists. `atOrPast` expands to
 * the same state set stageCounts used; `state` is exact. Both given → the
 * intersection (normally one state or none).
 */
export function pieceStateFilter(f: Pick<PieceFilter, 'atOrPast' | 'state'>): PieceState[] | undefined {
  if (f.atOrPast && f.state) return AT_OR_PAST[f.atOrPast].includes(f.state) ? [f.state] : []
  if (f.atOrPast) return [...AT_OR_PAST[f.atOrPast]]
  if (f.state) return [f.state]
  return undefined
}

/** The where clause shared by `piecesWhere` and `piecesCount`, so a list and its total cannot drift. */
function piecesWhereClause(f: PieceFilter): Prisma.PieceWhereInput {
  const states = pieceStateFilter(f)
  return {
    ...(f.lineItemId ? { lineItemId: f.lineItemId } : {}),
    ...(f.orderId ? { lineItem: { orderId: f.orderId } } : {}),
    ...(f.programId ? { lineItem: { order: { programId: f.programId } } } : {}),
    ...(states ? { state: { in: states } } : {}),
  }
}

export async function piecesWhere(f: PieceFilter): Promise<PieceListRow[]> {
  const pieces = await prisma.piece.findMany({
    where: piecesWhereClause(f),
    include: {
      worker: { select: { name: true } },
      lineItem: { include: { style: { select: { styleCode: true } }, order: { select: { id: true, orderNumber: true } } } },
      events: { orderBy: { createdAt: 'desc' }, take: 1, select: { eventType: true, createdAt: true } },
    },
    orderBy: [{ lineItem: { order: { orderNumber: 'asc' } } }, { lineItemId: 'asc' }, { serial: 'asc' }],
    // A page has to stop somewhere; PIECE_LIST_CAP rows is far past what a human scrolls in
    // one sitting. The caller shows a truncation notice (via piecesCount) when the true
    // total exceeds this cap, so the count and the rows never quietly disagree.
    take: PIECE_LIST_CAP,
  })
  const now = Date.now()
  return pieces.map((p) => {
    const last = p.events[0]
    const since = last?.createdAt ?? p.createdAt
    return {
      id: p.id, serial: p.serial, qrToken: p.qrToken, state: p.state, lineItemId: p.lineItemId,
      styleCode: p.lineItem.style.styleCode, size: p.lineItem.size, shade: p.lineItem.shade,
      orderNumber: p.lineItem.order.orderNumber, orderId: p.lineItem.order.id,
      worker: p.worker?.name ?? null,
      ageMinutes: Math.max(0, Math.floor((now - since.getTime()) / 60000)),
      lastEvent: last ? { type: last.eventType, at: last.createdAt.toISOString() } : null,
    }
  })
}

/** The true count behind a filter, for when `piecesWhere`'s 2000-row cap may have truncated the list. */
export async function piecesCount(f: PieceFilter): Promise<number> {
  return prisma.piece.count({ where: piecesWhereClause(f) })
}
