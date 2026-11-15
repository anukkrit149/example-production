import { z } from 'zod'
import { ChecklistAnswers } from './checklists'
import { MutationEnvelope } from './mutation'
import { CustodyStageSchema, MaterialLine, StageSchema } from './stages'

export { StageSchema, CustodyStageSchema, MaterialLine } from './stages'
export type { Stage, CustodyStage } from './stages'

export const ActivatePieceInput = MutationEnvelope.extend({
  lineItemId: z.uuid(),
  serial: z.number().int().positive().optional(),
  leatherLot: z.string().min(1).max(64),
  notes: z.string().max(500).optional(),
  checklist: ChecklistAnswers,
})
export type ActivatePieceInput = z.infer<typeof ActivatePieceInput>

/** Activation addressed by the scanned piece itself (the planned label). */
export const ActivateByIdInput = MutationEnvelope.extend({
  leatherLot: z.string().min(1).max(64),
  notes: z.string().max(500).optional(),
  checklist: ChecklistAnswers,
})
export type ActivateByIdInput = z.infer<typeof ActivateByIdInput>

export const SubmitQaInput = MutationEnvelope.extend({
  stage: StageSchema.exclude(['packaging']),
  result: z.enum(['pass', 'fail']),
  defectCodes: z.array(z.string().max(32)).default([]),
  notes: z.string().max(500).optional(),
  checklist: ChecklistAnswers.optional(),
}).refine((v) => v.result === 'fail' || v.checklist !== undefined, {
  message: 'a pass needs the checklist',
  path: ['checklist'],
}).refine((v) => v.result === 'pass' || v.defectCodes.length > 0 || (v.notes?.trim().length ?? 0) > 0, {
  message: 'a fail needs a defect code or a note',
  path: ['defectCodes'],
})
export type SubmitQaInput = z.infer<typeof SubmitQaInput>

export const IssueInput = MutationEnvelope.extend({
  stage: CustodyStageSchema,
  workerId: z.uuid(),
  materials: z.array(MaterialLine).default([]),
  groupId: z.uuid().optional(),
  checklist: ChecklistAnswers,
})
export type IssueInput = z.infer<typeof IssueInput>

export const ReceiveInput = MutationEnvelope.extend({
  stage: CustodyStageSchema,
  workerId: z.uuid(),
  shortage: z.string().max(500).optional(),
  groupId: z.uuid().optional(),
  checklist: ChecklistAnswers,
})
export type ReceiveInput = z.infer<typeof ReceiveInput>

export const HoldInput = MutationEnvelope.extend({ reason: z.string().min(1).max(200) })
export const ReleaseInput = MutationEnvelope.extend({ reason: z.string().min(1).max(200) })
export const ReprintInput = MutationEnvelope.extend({
  reason: z.enum(['damaged', 'unreadable', 'missing', 'correction']),
})
export type HoldInput = z.infer<typeof HoldInput>
export type ReleaseInput = z.infer<typeof ReleaseInput>
export type ReprintInput = z.infer<typeof ReprintInput>

/**
 * A fixed vocabulary, like the QA defect codes: "why was this piece written
 * off" is a question a supervisor asks of a whole month, and free text cannot
 * be counted. `other` is the escape hatch, and it is the one reason that must
 * carry a note — an uncounted rejection with no explanation teaches nobody.
 */
export const REJECT_REASONS = ['cut_defect', 'leather_flaw', 'stitch_defect', 'damaged', 'lost', 'other'] as const

export const RejectInput = MutationEnvelope.extend({
  reason: z.enum(REJECT_REASONS),
  note: z.string().max(500).optional(),
  replace: z.boolean().default(false),
}).refine((v) => v.reason !== 'other' || (v.note?.trim().length ?? 0) > 0, {
  message: 'a reason of other needs a note saying what happened',
  path: ['note'],
})
export type RejectInput = z.infer<typeof RejectInput>
