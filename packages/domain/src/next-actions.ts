import type { CustodyStage, PieceState, Stage } from './piece-state'

export type Action = 'activate' | 'submit_qa' | 'issue' | 'receive' | 'hold' | 'release' | 'reject' | 'reprint' | 'cancel' | 'pack'

const TABLE: Record<PieceState, Action[]> = {
  PLANNED: ['activate', 'cancel'],
  CUT_PENDING_QA: ['submit_qa', 'reject'],
  CUT_OK: ['issue', 'reprint', 'hold', 'reject'],
  WITH_PASTING: ['receive', 'hold'],
  PASTED_PENDING_QA: ['submit_qa', 'reject'],
  PASTE_OK: ['issue', 'reprint', 'hold', 'reject'],
  WITH_STITCHING: ['receive', 'hold'],
  STITCHED_PENDING_QA: ['submit_qa', 'reject'],
  STITCH_OK: ['issue', 'reprint', 'hold', 'reject'],
  WITH_FINISHING: ['receive', 'hold'],
  FINISHED_PENDING_QA: ['submit_qa', 'reject'],
  FINISH_OK: ['submit_qa', 'reprint', 'hold', 'reject'],
  QC_OK: ['pack', 'hold'],
  PACKED: [],
  SHIPPED: [],
  ON_HOLD: ['release'],
  REJECTED: [],
  CANCELLED: [],
}
export const allowedActions = (s: PieceState): Action[] => TABLE[s]

const STAGE_OF: Record<PieceState, Stage | null> = {
  PLANNED: null, CUT_PENDING_QA: 'cutting', CUT_OK: 'cutting',
  WITH_PASTING: 'pasting', PASTED_PENDING_QA: 'pasting', PASTE_OK: 'pasting',
  WITH_STITCHING: 'stitching', STITCHED_PENDING_QA: 'stitching', STITCH_OK: 'stitching',
  WITH_FINISHING: 'finishing', FINISHED_PENDING_QA: 'finishing', FINISH_OK: 'qc',
  QC_OK: 'packaging', PACKED: 'packaging', SHIPPED: null, ON_HOLD: null, REJECTED: null, CANCELLED: null,
}
export const stageForState = (s: PieceState): Stage | null => STAGE_OF[s]

const LABEL_OF: Partial<Record<PieceState, Stage>> = { CUT_OK: 'cutting', PASTE_OK: 'pasting', STITCH_OK: 'stitching', FINISH_OK: 'finishing' }
export const labelStageFor = (s: PieceState): Stage | null => LABEL_OF[s] ?? null

const NEXT_CUSTODY: Partial<Record<PieceState, CustodyStage>> = { CUT_OK: 'pasting', PASTE_OK: 'stitching', STITCH_OK: 'finishing' }
export const nextCustodyStage = (s: PieceState): CustodyStage | null => NEXT_CUSTODY[s] ?? null
export const WORKER_TYPE_FOR_STAGE: Record<CustodyStage, 'paster' | 'tailor' | 'finisher'> = { pasting: 'paster', stitching: 'tailor', finishing: 'finisher' }
