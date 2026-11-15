import { z } from 'zod'

export const MutationEnvelope = z.object({
  expectedVersion: z.number().int().nonnegative().optional(),
  clientTimestamp: z.iso.datetime().optional(),
  attachmentIds: z.array(z.uuid()).default([]),
})
export type MutationEnvelope = z.infer<typeof MutationEnvelope>

export type Infer<T extends z.ZodType> = z.infer<T>
