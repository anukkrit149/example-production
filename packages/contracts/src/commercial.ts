import { z } from 'zod'
import { STYLE_CATEGORIES, STYLE_CODE_RE, normalizeStyleCode } from '@hf/domain'

export const ORG_TYPES = ['buyer', 'agent'] as const
export const GENDERS = ['mens', 'womens', 'unisex', 'kids'] as const
export const USER_ROLES = ['admin', 'store', 'qa', 'supervisor', 'merchandiser', 'management'] as const

const name = z.string().trim().min(1).max(120)
const nullableText = (max: number) => z.string().trim().max(max).nullable().optional()

export const CreateOrganizationInput = z.object({ type: z.enum(ORG_TYPES), name })
export const UpdateOrganizationInput = z.object({ name: name.optional(), active: z.boolean().optional() })

export const CreateProgramInput = z.object({
  name,
  buyerId: z.uuid(),
  agentId: z.uuid().nullable().optional(),
  season: z.string().trim().min(1).max(32).nullable().optional(),
})
export const UpdateProgramInput = z.object({
  name: name.optional(),
  agentId: z.uuid().nullable().optional(),
  season: nullableText(32),
})

/** A calendar date, no time: "2026-11-15". Orders are due on a day, not at a moment. */
const dueDate = z.iso.date().nullable().optional()

export const CreateOrderInput = z.object({
  programId: z.uuid(),
  orderNumber: z.string().trim().min(1).max(40),
  dueDate,
})
export const UpdateOrderInput = z.object({
  orderNumber: z.string().trim().min(1).max(40).optional(),
  dueDate,
})

/** Uppercased and trimmed before the pattern runs, so "lj-204" is accepted as LJ-204. */
const styleCode = z.string().transform(normalizeStyleCode).pipe(z.string().regex(STYLE_CODE_RE, 'must be 2–12 letters, digits or hyphens, starting with a letter'))

export const CreateStyleInput = z.object({
  styleCode,
  category: z.enum(STYLE_CATEGORIES),
  gender: z.enum(GENDERS),
  ownerId: z.uuid().nullable().optional(),
  description: nullableText(500),
  referenceAttachmentId: z.uuid().nullable().optional(),
})
export const UpdateStyleInput = z.object({
  styleCode: styleCode.optional(),
  description: nullableText(500),
  ownerId: z.uuid().nullable().optional(),
  active: z.boolean().optional(),
  referenceAttachmentId: z.uuid().nullable().optional(),
})

export const CreateLineItemInput = z.object({
  orderId: z.uuid(),
  styleId: z.uuid(),
  size: z.string().trim().min(1).max(8),
  shade: z.string().trim().min(1).max(32),
  quantity: z.number().int().min(1).max(5000),
})

/**
 * `reason` is optional here and required by the service only when the change is
 * a decrease — the schema cannot know the current quantity.
 */
export const ChangeQuantityInput = z.object({
  quantity: z.number().int().min(0).max(5000),
  reason: z.string().trim().min(3).max(200).optional(),
})

/**
 * Office people sign in to the dashboard with an email; floor people sign in
 * to the phone with a code an admin issues later, so they need no email at
 * all. Only an admin must have one — the dashboard is where admins work.
 */
export const CreateTeamMemberInput = z
  .object({
    name,
    email: z.email().transform((e) => e.trim().toLowerCase()).optional(),
    role: z.enum(USER_ROLES),
  })
  .refine((v) => v.role !== 'admin' || Boolean(v.email), { path: ['email'], message: 'an admin needs an email to sign in to the dashboard' })
export const UpdateTeamMemberInput = z.object({
  name: name.optional(),
  role: z.enum(USER_ROLES).optional(),
  active: z.boolean().optional(),
})

export type CreateOrganizationInput = z.infer<typeof CreateOrganizationInput>
export type UpdateOrganizationInput = z.infer<typeof UpdateOrganizationInput>
export type CreateProgramInput = z.infer<typeof CreateProgramInput>
export type UpdateProgramInput = z.infer<typeof UpdateProgramInput>
export type CreateOrderInput = z.infer<typeof CreateOrderInput>
export type UpdateOrderInput = z.infer<typeof UpdateOrderInput>
export type CreateStyleInput = z.infer<typeof CreateStyleInput>
export type UpdateStyleInput = z.infer<typeof UpdateStyleInput>
export type CreateLineItemInput = z.infer<typeof CreateLineItemInput>
export type ChangeQuantityInput = z.infer<typeof ChangeQuantityInput>
export type CreateTeamMemberInput = z.infer<typeof CreateTeamMemberInput>
export type UpdateTeamMemberInput = z.infer<typeof UpdateTeamMemberInput>
