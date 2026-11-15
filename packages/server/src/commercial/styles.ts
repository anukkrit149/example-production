import { prisma, type Style } from '@hf/db'
import type { CreateStyleInput, UpdateStyleInput } from '@hf/contracts'
import { ApiError } from '../api'
import { translatePrismaError } from '../errors'
import { idempotent } from '../idempotency'
import { photoUrl, photoUrls } from '../storage'

export type StyleRow = {
  id: string
  styleCode: string
  category: string
  gender: string
  description: string | null
  active: boolean
  owner: { id: string; name: string } | null
  lineItems: number
  referencePhotoUrl: string | null
}

export async function listStyles(opts: { activeOnly?: boolean } = {}): Promise<StyleRow[]> {
  const rows = await prisma.style.findMany({
    where: opts.activeOnly ? { active: true } : undefined,
    orderBy: [{ active: 'desc' }, { styleCode: 'asc' }],
    include: {
      owner: { select: { id: true, name: true } },
      _count: { select: { lineItems: true } },
      referenceAttachment: { select: { storageKey: true } },
    },
  })
  const urls = await photoUrls(rows.flatMap((s) => (s.referenceAttachment ? [s.referenceAttachment.storageKey] : [])))
  return rows.map((s) => ({
    id: s.id, styleCode: s.styleCode, category: s.category, gender: s.gender, description: s.description,
    active: s.active, owner: s.owner, lineItems: s._count.lineItems,
    referencePhotoUrl: s.referenceAttachment ? urls.get(s.referenceAttachment.storageKey) ?? null : null,
  }))
}

async function requireOwner(id: string): Promise<void> {
  const org = await prisma.organization.findUnique({ where: { id } })
  if (!org || !org.active) throw new ApiError(422, 'owner must be an active organisation', 'invalid_owner')
}

/** A reference photo must be a confirmed upload that is not floor evidence and is not another style's reference. */
async function requireReferencePhoto(id: string, forStyleId: string | null): Promise<void> {
  const att = await prisma.attachment.findUnique({ where: { id }, include: { styleReference: { select: { id: true } } } })
  const usable = att && att.confirmedAt !== null && att.pieceEventId === null && (att.styleReference === null || att.styleReference.id === forStyleId)
  if (!usable) throw new ApiError(422, 'reference photo is not usable', 'reference_invalid')
}

export async function createStyle(input: CreateStyleInput, key: string) {
  if (input.ownerId) await requireOwner(input.ownerId)
  if (input.referenceAttachmentId) await requireReferencePhoto(input.referenceAttachmentId, null)
  try {
    return await idempotent({
      key,
      entity: 'style',
      run: (tx) => tx.style.create({
        data: {
          styleCode: input.styleCode, category: input.category, gender: input.gender,
          ownerId: input.ownerId ?? null, description: input.description ?? null,
          referenceAttachmentId: input.referenceAttachmentId ?? null,
        },
      }),
      reload: (tx, id) => tx.style.findUnique({ where: { id } }),
    })
  } catch (e) {
    translatePrismaError(e, { styleCode: input.styleCode })
  }
}

/**
 * The style code is on physical labels stuck to real pieces. Once any piece of
 * this style has been activated (left PLANNED for anything but CANCELLED), the
 * code is frozen; description, owner and active remain editable.
 */
export async function updateStyle(id: string, input: UpdateStyleInput): Promise<Style> {
  const existing = await prisma.style.findUnique({ where: { id } })
  if (!existing) throw new ApiError(404, 'style not found', 'not_found')
  if (input.ownerId) await requireOwner(input.ownerId)
  if (input.referenceAttachmentId) await requireReferencePhoto(input.referenceAttachmentId, id)

  if (input.styleCode !== undefined && input.styleCode !== existing.styleCode) {
    const printed = await prisma.piece.count({ where: { lineItem: { styleId: id }, state: { notIn: ['PLANNED', 'CANCELLED'] } } })
    if (printed > 0)
      throw new ApiError(422, `${existing.styleCode} is printed on labels already; the code cannot change`, 'style_code_frozen')
  }

  try {
    return await prisma.style.update({
      where: { id },
      data: {
        ...(input.styleCode !== undefined ? { styleCode: input.styleCode } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.ownerId !== undefined ? { ownerId: input.ownerId } : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
        ...(input.referenceAttachmentId !== undefined ? { referenceAttachmentId: input.referenceAttachmentId } : {}),
      },
    })
  } catch (e) {
    translatePrismaError(e, { styleCode: input.styleCode ?? existing.styleCode })
  }
}

export async function getStyle(id: string) {
  const s = await prisma.style.findUnique({
    where: { id },
    include: {
      owner: { select: { id: true, name: true } },
      lineItems: { include: { order: { include: { program: { select: { name: true } } } } } },
      referenceAttachment: { select: { storageKey: true } },
    },
  })
  if (!s) return null
  const printed = await prisma.piece.count({ where: { lineItem: { styleId: id }, state: { notIn: ['PLANNED', 'CANCELLED'] } } })
  const byOrder = new Map<string, { id: string; orderNumber: string; programName: string; quantity: number }>()
  for (const li of s.lineItems) {
    const cur = byOrder.get(li.orderId) ?? { id: li.orderId, orderNumber: li.order.orderNumber, programName: li.order.program.name, quantity: 0 }
    cur.quantity += li.quantity
    byOrder.set(li.orderId, cur)
  }
  return {
    id: s.id, styleCode: s.styleCode, category: s.category, gender: s.gender, description: s.description, active: s.active,
    owner: s.owner, lineItems: s.lineItems.length, frozen: printed > 0, orders: [...byOrder.values()],
    referenceAttachmentId: s.referenceAttachmentId,
    referencePhotoUrl: s.referenceAttachment ? await photoUrl(s.referenceAttachment.storageKey) : null,
  }
}
