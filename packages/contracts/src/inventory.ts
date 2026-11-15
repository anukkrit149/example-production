import { z } from 'zod'
import { MutationEnvelope } from './mutation'

/** Short, printable, fixed after creation: what a chip shows and a receipt line keys on. */
export const InventoryItemCode = z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9-]{1,15}$/, 'must be 2–16 letters, digits or hyphens')

export const CreateInventoryItemInput = z.object({
  code: InventoryItemCode,
  nameEn: z.string().trim().min(1).max(60),
  nameHi: z.string().trim().min(1).max(60),
  unit: z.string().trim().min(1).max(12).default('pcs'),
  position: z.number().int().min(0).default(0),
})
export type CreateInventoryItemInput = z.infer<typeof CreateInventoryItemInput>

export const UpdateInventoryItemInput = z.object({
  nameEn: z.string().trim().min(1).max(60).optional(),
  nameHi: z.string().trim().min(1).max(60).optional(),
  unit: z.string().trim().min(1).max(12).optional(),
  position: z.number().int().min(0).optional(),
  active: z.boolean().optional(),
})
export type UpdateInventoryItemInput = z.infer<typeof UpdateInventoryItemInput>

export const ATTACHMENT_PURPOSES = ['goods', 'place', 'document'] as const
export type AttachmentPurpose = (typeof ATTACHMENT_PURPOSES)[number]

/** One or more confirmed attachment ids per purpose. All three are required on receive. */
export const PhotoSet = z.object({
  goods: z.array(z.uuid()).min(1),
  place: z.array(z.uuid()).min(1),
  document: z.array(z.uuid()).min(1),
})
export type PhotoSet = z.infer<typeof PhotoSet>

const uniqueItems = (lines: Array<{ itemId: string }>) => new Set(lines.map((l) => l.itemId)).size === lines.length

export const GoodsSuggestionSchema = z.object({
  items: z.array(z.object({ code: z.string(), confidence: z.number().min(0).max(1) })),
})
export const DocumentSuggestionSchema = z.object({
  supplier: z.string().nullable(),
  reference: z.string().nullable(),
  date: z.string().nullable(),
  lines: z.array(z.object({
    text: z.string(),
    quantity: z.number().int().min(0).nullable(),
    code: z.string().nullable(),
    confidence: z.number().min(0).max(1),
  })),
})
export type GoodsSuggestion = z.infer<typeof GoodsSuggestionSchema>
export type DocumentSuggestion = z.infer<typeof DocumentSuggestionSchema>

/** What autofill proposed, sent back with the confirm so the event keeps it beside what the person chose. */
export const SuggestAudit = z.object({
  goods: GoodsSuggestionSchema.nullable().optional(),
  document: DocumentSuggestionSchema.nullable().optional(),
})
export type SuggestAudit = z.infer<typeof SuggestAudit>

export const RecordReceiptInput = MutationEnvelope.extend({
  items: z.array(z.object({ itemId: z.uuid(), expectedQty: z.number().int().min(0).optional() })).min(1).refine(uniqueItems, { message: 'an item is listed twice' }),
  supplier: z.string().trim().max(120).optional(),
  reference: z.string().trim().max(60).optional(),
  location: z.string().trim().max(60).optional(),
  note: z.string().trim().max(500).optional(),
  photos: PhotoSet,
  suggestions: SuggestAudit.optional(),
})
export type RecordReceiptInput = z.infer<typeof RecordReceiptInput>

export const CountReceiptInput = MutationEnvelope.extend({
  expectedVersion: z.number().int().nonnegative(),
  lines: z.array(z.object({ itemId: z.uuid(), expectedQty: z.number().int().min(0).optional(), countedQty: z.number().int().min(0) })).min(1).refine(uniqueItems, { message: 'an item is listed twice' }),
  note: z.string().trim().max(500).optional(),
})
export type CountReceiptInput = z.infer<typeof CountReceiptInput>

export const SuggestInput = z.object({ attachmentId: z.uuid(), kind: z.enum(['goods', 'document']) })
export type SuggestInput = z.infer<typeof SuggestInput>

export const SuggestOutput = z.union([
  z.object({ available: z.literal(false) }),
  z.object({ available: z.literal(true), kind: z.literal('goods'), items: GoodsSuggestionSchema.shape.items }),
  z.object({ available: z.literal(true), kind: z.literal('document'), document: DocumentSuggestionSchema }),
])
export type SuggestOutput = z.infer<typeof SuggestOutput>
