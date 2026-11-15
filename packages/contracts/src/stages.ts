import { z } from 'zod'

export const StageSchema = z.enum(['cutting', 'pasting', 'stitching', 'finishing', 'qc', 'packaging'])
export const CustodyStageSchema = z.enum(['pasting', 'stitching', 'finishing'])
export type Stage = z.infer<typeof StageSchema>
export type CustodyStage = z.infer<typeof CustodyStageSchema>

export const MaterialLine = z.object({
  code: z.string().min(1).max(32),
  qty: z.number().positive(),
  unit: z.string().min(1).max(16),
})
export type MaterialLine = z.infer<typeof MaterialLine>
