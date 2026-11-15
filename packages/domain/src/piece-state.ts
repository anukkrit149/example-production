export const STAGES = ['cutting', 'pasting', 'stitching', 'finishing', 'qc', 'packaging'] as const
export type Stage = (typeof STAGES)[number]
export const CUSTODY_STAGES = ['pasting', 'stitching', 'finishing'] as const
export type CustodyStage = (typeof CUSTODY_STAGES)[number]

export const PIECE_STATES = [
  'PLANNED', 'CUT_PENDING_QA', 'CUT_OK', 'WITH_PASTING', 'PASTED_PENDING_QA', 'PASTE_OK',
  'WITH_STITCHING', 'STITCHED_PENDING_QA', 'STITCH_OK', 'WITH_FINISHING', 'FINISHED_PENDING_QA',
  'FINISH_OK', 'QC_OK', 'PACKED', 'SHIPPED', 'ON_HOLD', 'REJECTED', 'CANCELLED',
] as const
export type PieceState = (typeof PIECE_STATES)[number]

export const PIECE_EVENT_TYPES = [
  'PIECE_ACTIVATED', 'STAGE_QA_PASSED', 'STAGE_QA_FAILED', 'REWORK_ASSIGNED', 'ISSUED', 'RECEIVED',
  'FIRST_PIECE_APPROVED', 'PIECE_HELD', 'PIECE_RELEASED', 'PIECE_REJECTED', 'PIECE_REPLACED',
  'PIECE_CANCELLED', 'COMPONENT_ADJUSTED', 'CORRECTION', 'LABEL_PRINT_REQUESTED',
  'LABEL_REPRINT_REQUESTED', 'PACKED', 'SHIPPED',
] as const
export type PieceEventType = (typeof PIECE_EVENT_TYPES)[number]

export type DomainEvent = { type: PieceEventType; stage?: Stage; returnTo?: PieceState }
export type TransitionResult = { ok: true; next: PieceState } | { ok: false; reason: string }

// Per custody stage: the QA-passed state before it, the with-worker state, the pending-QA state after it.
const CUSTODY: Record<CustodyStage, { from: PieceState; with: PieceState; pending: PieceState }> = {
  pasting:   { from: 'CUT_OK',    with: 'WITH_PASTING',   pending: 'PASTED_PENDING_QA' },
  stitching: { from: 'PASTE_OK',  with: 'WITH_STITCHING', pending: 'STITCHED_PENDING_QA' },
  finishing: { from: 'STITCH_OK', with: 'WITH_FINISHING', pending: 'FINISHED_PENDING_QA' },
}

// Per QA stage: the pending state it inspects and the state it produces.
const QA: Record<Exclude<Stage, 'packaging'>, { pending: PieceState; passed: PieceState }> = {
  cutting:   { pending: 'CUT_PENDING_QA',      passed: 'CUT_OK' },
  pasting:   { pending: 'PASTED_PENDING_QA',   passed: 'PASTE_OK' },
  stitching: { pending: 'STITCHED_PENDING_QA', passed: 'STITCH_OK' },
  finishing: { pending: 'FINISHED_PENDING_QA', passed: 'FINISH_OK' },
  qc:        { pending: 'FINISH_OK',           passed: 'QC_OK' },
}

const LABEL_STATE: Partial<Record<Stage, PieceState>> = {
  cutting: 'CUT_OK', pasting: 'PASTE_OK', stitching: 'STITCH_OK', finishing: 'FINISH_OK',
}

const TERMINAL: PieceState[] = ['SHIPPED', 'REJECTED', 'CANCELLED']
const REJECTABLE: PieceState[] = [
  'CUT_PENDING_QA', 'CUT_OK', 'PASTED_PENDING_QA', 'PASTE_OK', 'STITCHED_PENDING_QA', 'STITCH_OK',
  'FINISHED_PENDING_QA', 'FINISH_OK', 'QC_OK',
]

const no = (reason: string): TransitionResult => ({ ok: false, reason })
const yes = (next: PieceState): TransitionResult => ({ ok: true, next })

export function transition(state: PieceState, ev: DomainEvent): TransitionResult {
  if (TERMINAL.includes(state)) return no(`piece is ${state}`)

  if (state === 'ON_HOLD') {
    if (ev.type !== 'PIECE_RELEASED') return no('piece is on hold')
    if (!ev.returnTo || ev.returnTo === 'ON_HOLD' || TERMINAL.includes(ev.returnTo)) return no('release needs a valid returnTo state')
    return yes(ev.returnTo)
  }

  switch (ev.type) {
    case 'PIECE_ACTIVATED':
      return state === 'PLANNED' && ev.stage === 'cutting' ? yes('CUT_PENDING_QA') : no('only a planned piece can be activated at cutting')
    case 'PIECE_CANCELLED':
      return state === 'PLANNED' ? yes('CANCELLED') : no('only a planned piece can be cancelled')
    case 'STAGE_QA_PASSED': {
      const qa = ev.stage && ev.stage !== 'packaging' ? QA[ev.stage] : undefined
      return qa && qa.pending === state ? yes(qa.passed) : no(`${ev.stage} QA is not due in state ${state}`)
    }
    case 'STAGE_QA_FAILED': {
      const qa = ev.stage && ev.stage !== 'packaging' ? QA[ev.stage] : undefined
      return qa && qa.pending === state ? yes(state) : no(`${ev.stage} QA is not due in state ${state}`)
    }
    case 'REWORK_ASSIGNED': {
      const c = ev.stage && (CUSTODY_STAGES as readonly string[]).includes(ev.stage) ? CUSTODY[ev.stage as CustodyStage] : undefined
      return c && c.pending === state ? yes(c.with) : no(`rework for ${ev.stage} is not possible in state ${state}`)
    }
    case 'ISSUED': {
      const c = ev.stage && (CUSTODY_STAGES as readonly string[]).includes(ev.stage) ? CUSTODY[ev.stage as CustodyStage] : undefined
      return c && c.from === state ? yes(c.with) : no(`cannot issue to ${ev.stage} from ${state}`)
    }
    case 'RECEIVED': {
      const c = ev.stage && (CUSTODY_STAGES as readonly string[]).includes(ev.stage) ? CUSTODY[ev.stage as CustodyStage] : undefined
      return c && c.with === state ? yes(c.pending) : no(`cannot receive from ${ev.stage} in ${state}`)
    }
    case 'PIECE_HELD':
      return state === 'PLANNED' ? no('planned pieces cannot be held') : yes('ON_HOLD')
    case 'PIECE_RELEASED':
      return no('piece is not on hold')
    case 'PIECE_REJECTED':
      return REJECTABLE.includes(state) ? yes('REJECTED') : no(`cannot reject in ${state}`)
    case 'PACKED':
      return state === 'QC_OK' ? yes('PACKED') : no('only a QC-passed piece can be packed')
    case 'SHIPPED':
      return state === 'PACKED' ? yes('SHIPPED') : no('only a packed piece can be shipped')
    case 'LABEL_PRINT_REQUESTED':
    case 'LABEL_REPRINT_REQUESTED':
      return ev.stage && LABEL_STATE[ev.stage] === state ? yes(state) : no(`no ${ev.stage} label in state ${state}`)
    case 'FIRST_PIECE_APPROVED':
    case 'COMPONENT_ADJUSTED':
    case 'CORRECTION':
    case 'PIECE_REPLACED':
      return yes(state)
  }
}
