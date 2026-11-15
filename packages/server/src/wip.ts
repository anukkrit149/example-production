import { prisma, type WorkerType } from '@hf/db'
import { CUSTODY_STAGES, stageForState, type CustodyStage, type Stage } from '@hf/domain'
import { piecesWhere, type PieceListRow } from './progress'

export type WorkerWip = { worker: { id: string; name: string; type: WorkerType }; stage: CustodyStage; count: number; oldestMinutes: number; pieces: PieceListRow[] }
export type QaWip = { stage: Stage; count: number; oldestMinutes: number; pieces: PieceListRow[] }
export type HoldRow = { piece: PieceListRow; reason: string | null; heldBy: string | null; heldAt: string | null }

const WITH: Record<CustodyStage, 'WITH_PASTING' | 'WITH_STITCHING' | 'WITH_FINISHING'> = {
  pasting: 'WITH_PASTING', stitching: 'WITH_STITCHING', finishing: 'WITH_FINISHING',
}
const PENDING = ['CUT_PENDING_QA', 'PASTED_PENDING_QA', 'STITCHED_PENDING_QA', 'FINISHED_PENDING_QA'] as const

const oldest = (rows: PieceListRow[]) => rows.reduce((m, r) => Math.max(m, r.ageMinutes), 0)

/** Who has what, and for how long. Sorted by the longest-held bundle first. */
export async function withWorkers(): Promise<WorkerWip[]> {
  const out: WorkerWip[] = []
  // Everything this needs is independent, so it goes out in one round trip's
  // worth of latency rather than five: the worker list, the id-only piece scan,
  // and the three per-stage row sets.
  const [workers, pieces, ...rowsByStage] = await Promise.all([
    prisma.worker.findMany({ select: { id: true, name: true, type: true } }),
    prisma.piece.findMany({ where: { state: { in: Object.values(WITH) } }, select: { id: true, workerId: true, state: true } }),
    ...CUSTODY_STAGES.map((stage) => piecesWhere({ state: WITH[stage] })),
  ])
  const byId = new Map(workers.map((w) => [w.id, w]))

  // The id→worker map above comes from a cheap id-only scan, so we bucket by
  // workerId rather than by row.worker (a name) — two workers who happen to
  // share a name must never merge into one group.
  const workerIdByPieceId = new Map<string, string>()
  for (const p of pieces) {
    // The issue route (ISSUED) is the only write path into a WITH_* state, and
    // it always requires a workerId and sets afterWorker. A null workerId here
    // is unreachable through that path — this skip only guards the read model
    // against a corrupt row.
    if (!p.workerId) continue
    workerIdByPieceId.set(p.id, p.workerId)
  }

  CUSTODY_STAGES.forEach((stage, i) => {
    const rows = rowsByStage[i]!
    const byWorkerId = new Map<string, PieceListRow[]>()
    for (const r of rows) {
      const workerId = workerIdByPieceId.get(r.id)
      if (!workerId) continue
      byWorkerId.set(workerId, [...(byWorkerId.get(workerId) ?? []), r])
    }
    for (const [workerId, workerRows] of byWorkerId) {
      const worker = byId.get(workerId)
      if (!worker) continue
      out.push({ worker, stage, count: workerRows.length, oldestMinutes: oldest(workerRows), pieces: workerRows })
    }
  })
  return out.sort((a, b) => b.oldestMinutes - a.oldestMinutes)
}

/** Sitting in the store room waiting for a QA checker, by stage. */
export async function awaitingQa(): Promise<QaWip[]> {
  const out: QaWip[] = []
  const rowSets = await Promise.all(PENDING.map((state) => piecesWhere({ state })))
  PENDING.forEach((state, i) => {
    const rows = rowSets[i]!
    if (rows.length) out.push({ stage: stageForState(state)!, count: rows.length, oldestMinutes: oldest(rows), pieces: rows })
  })
  return out
}

/** On hold, with the reason from the latest PIECE_HELD event. */
export async function onHold(): Promise<HoldRow[]> {
  const rows = await piecesWhere({ state: 'ON_HOLD' })
  if (rows.length === 0) return []
  const holds = await prisma.pieceEvent.findMany({
    where: { pieceId: { in: rows.map((r) => r.id) }, eventType: 'PIECE_HELD' },
    orderBy: { createdAt: 'desc' },
    include: { user: { select: { name: true } } },
  })
  const latest = new Map<string, (typeof holds)[number]>()
  for (const h of holds) if (!latest.has(h.pieceId)) latest.set(h.pieceId, h)
  return rows.map((piece) => {
    const h = latest.get(piece.id)
    const reason = (h?.details as { reason?: unknown } | null)?.reason
    return { piece, reason: typeof reason === 'string' ? reason : null, heldBy: h?.user.name ?? null, heldAt: h?.createdAt.toISOString() ?? null }
  })
}

export { CUSTODY_STAGES }
