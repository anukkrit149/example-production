import { z } from 'zod'
import { PICTOGRAMS } from '@hf/domain'
import { MaterialLine, StageSchema } from './stages'

export const ChecklistStepSchema = z.enum(['activate', 'qa', 'issue', 'receive', 'pack', 'ship'])
export const ChecklistItemKindSchema = z.enum(['confirm', 'photo', 'materials', 'measure'])

/** `true` for a check, photo or materials item; a finite number for a measurement. A NO is never sent. */
export const ChecklistAnswer = z.object({
  itemId: z.uuid(),
  value: z.union([z.literal(true), z.number().finite()]),
  materials: z.array(MaterialLine).optional(),
})
export const ChecklistAnswers = z.object({
  versionId: z.uuid(),
  answers: z.array(ChecklistAnswer).min(1),
})
export type ChecklistAnswers = z.infer<typeof ChecklistAnswers>

/** Admin editing. Items arrive whole; the server rewrites the draft's items in one transaction. */
export const ChecklistItemInput = z.object({
  kind: ChecklistItemKindSchema,
  textEn: z.string().trim().min(1).max(160),
  textHi: z.string().trim().min(1).max(160),
  pictogram: z.enum(PICTOGRAMS),
  unit: z.string().trim().min(1).max(12).optional(),
  min: z.number().finite().nullable().optional(),
  max: z.number().finite().nullable().optional(),
}).refine((i) => i.kind !== 'measure' || !!i.unit, { message: 'a measurement needs a unit', path: ['unit'] })
  .refine((i) => i.kind === 'measure' || (i.unit === undefined && i.min == null && i.max == null), { message: 'only a measurement carries a unit or range', path: ['unit'] })
  .refine((i) => i.min == null || i.max == null || i.min <= i.max, { message: 'min must not exceed max', path: ['max'] })
export const ChecklistDraftInput = z.object({ items: z.array(ChecklistItemInput).min(1).max(20) })
export type ChecklistDraftInput = z.infer<typeof ChecklistDraftInput>

/** Creating a program override: which default to copy. */
export const CreateOverrideInput = z.object({
  programId: z.uuid(),
  step: ChecklistStepSchema,
  stage: StageSchema.nullable(),
  category: z.enum(['jacket', 'outerwear', 'bag', 'belt', 'slg']),
})
export type CreateOverrideInput = z.infer<typeof CreateOverrideInput>
