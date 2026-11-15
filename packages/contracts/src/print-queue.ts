import { z } from 'zod'
import { LabelKindSchema } from './labels'
import { StageSchema } from './stages'

export const ExportQuery = z.object({
  format: z.enum(['csv', 'xlsx']),
  kind: LabelKindSchema.default('stage'),
  stage: StageSchema.optional(),
  labelIds: z.array(z.uuid()).min(1),
}).refine((v) => v.kind === 'planned' || v.stage, { message: 'stage labels need a stage', path: ['stage'] })
export type ExportQuery = z.infer<typeof ExportQuery>

export const MarkPrintedInput = z.object({ copies: z.number().int().positive().default(1) })
export type MarkPrintedInput = z.infer<typeof MarkPrintedInput>
