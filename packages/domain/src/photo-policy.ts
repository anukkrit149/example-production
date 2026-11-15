import type { PieceEventType } from './piece-state'
export type PhotoRequirement = 'required' | 'optional' | 'none'
const POLICY: Record<PieceEventType, PhotoRequirement> = {
  PIECE_ACTIVATED: 'required', STAGE_QA_PASSED: 'required', STAGE_QA_FAILED: 'required',
  ISSUED: 'required', RECEIVED: 'required', PACKED: 'required', SHIPPED: 'required',
  FIRST_PIECE_APPROVED: 'required', REWORK_ASSIGNED: 'optional',
  PIECE_HELD: 'required', PIECE_RELEASED: 'required', PIECE_REJECTED: 'optional', PIECE_REPLACED: 'optional',
  PIECE_CANCELLED: 'none', COMPONENT_ADJUSTED: 'none', CORRECTION: 'none',
  LABEL_PRINT_REQUESTED: 'none', LABEL_REPRINT_REQUESTED: 'none',
}
export const photoRequirement = (t: PieceEventType): PhotoRequirement => POLICY[t]
