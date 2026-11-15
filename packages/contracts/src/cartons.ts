import { z } from 'zod'
import { ChecklistAnswers } from './checklists'
import { MutationEnvelope } from './mutation'

export const Carton = z.string().trim().min(1).max(32).transform((s) => s.toUpperCase())

export const PackInput = MutationEnvelope.extend({ carton: Carton, checklist: ChecklistAnswers })
export type PackInput = z.infer<typeof PackInput>

/** Ships every PACKED piece of one carton in one order. One idempotency key per carton. */
export const ShipCartonInput = MutationEnvelope.extend({ orderId: z.uuid(), checklist: ChecklistAnswers })
export type ShipCartonInput = z.infer<typeof ShipCartonInput>
