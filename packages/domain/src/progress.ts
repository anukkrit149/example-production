import { PIECE_STATES, STAGES, type PieceState, type Stage } from './piece-state'

export type StageCounts = {
  cutting: number
  pasting: number
  stitching: number
  finishing: number
  qc: number
  packaging: number
  /** Still waiting to be cut. total - planned - cancelled is what has started. */
  planned: number
  rejected: number
  cancelled: number
  onHold: number
  total: number
}

/** The state a piece is in once a stage's QA has passed. */
const PASSED: Record<Stage, PieceState> = {
  cutting: 'CUT_OK',
  pasting: 'PASTE_OK',
  stitching: 'STITCH_OK',
  finishing: 'FINISH_OK',
  qc: 'QC_OK',
  packaging: 'PACKED',
}

const idx = (s: PieceState) => PIECE_STATES.indexOf(s)
const LAST_PROGRESS = idx('SHIPPED')

/**
 * "At or past" a stage means the piece's state is that stage's passed state or
 * any later state on the happy path, up to SHIPPED. The list is sliced out of
 * PIECE_STATES, whose order is the production order — so this table cannot
 * drift from the state machine. ON_HOLD, REJECTED and CANCELLED sit after
 * SHIPPED in that list and are excluded on purpose: a held piece has not
 * progressed, and its previous stage is not stored on the row.
 *
 * The same table drives the piece list behind each count, so a number on a
 * strip and the rows it links to are computed from one predicate.
 */
export const AT_OR_PAST: Record<Stage, readonly PieceState[]> = Object.fromEntries(
  STAGES.map((stage) => [stage, PIECE_STATES.slice(idx(PASSED[stage]), LAST_PROGRESS + 1)]),
) as unknown as Record<Stage, readonly PieceState[]>

/** Every state a piece can be in once it has left PLANNED for good. */
export const STARTED_STATES: readonly PieceState[] = PIECE_STATES.filter((s) => s !== 'PLANNED' && s !== 'CANCELLED')

const SETS = Object.fromEntries(STAGES.map((s) => [s, new Set(AT_OR_PAST[s])])) as Record<Stage, Set<PieceState>>

export const emptyCounts = (): StageCounts => ({
  cutting: 0, pasting: 0, stitching: 0, finishing: 0, qc: 0, packaging: 0,
  planned: 0, rejected: 0, cancelled: 0, onHold: 0, total: 0,
})

export function stageCountsFromRows(rows: Array<{ state: PieceState; count: number }>): StageCounts {
  const c = emptyCounts()
  for (const { state, count } of rows) {
    c.total += count
    for (const stage of STAGES) if (SETS[stage].has(state)) c[stage] += count
    if (state === 'PLANNED') c.planned += count
    if (state === 'REJECTED') c.rejected += count
    if (state === 'CANCELLED') c.cancelled += count
    if (state === 'ON_HOLD') c.onHold += count
  }
  return c
}

export function stageCounts(states: Iterable<PieceState>): StageCounts {
  const tally = new Map<PieceState, number>()
  for (const s of states) tally.set(s, (tally.get(s) ?? 0) + 1)
  return stageCountsFromRows([...tally].map(([state, count]) => ({ state, count })))
}

export function sumCounts(list: StageCounts[]): StageCounts {
  const out = emptyCounts()
  for (const c of list) for (const k of Object.keys(out) as Array<keyof StageCounts>) out[k] += c[k]
  return out
}
