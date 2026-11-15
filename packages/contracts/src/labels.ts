import { z } from 'zod'
import { StageSchema } from './stages'

export const LabelKindSchema = z.enum(['planned', 'stage'])

/** Dashboard bulk export. Scope is a line item or an order; ids narrow within it. */
export const LabelExportInput = z.object({
  kind: LabelKindSchema,
  stage: StageSchema.optional(),
  format: z.enum(['csv', 'xlsx']),
  lineItemId: z.uuid().optional(),
  orderId: z.uuid().optional(),
  labelIds: z.array(z.uuid()).optional(),
}).refine((v) => v.lineItemId || v.orderId || v.labelIds?.length, { message: 'give a line item, an order, or label ids' })
  .refine((v) => v.kind === 'planned' || v.stage, { message: 'stage labels need a stage', path: ['stage'] })
export type LabelExportInput = z.infer<typeof LabelExportInput>
