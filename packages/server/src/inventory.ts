import { prisma, Prisma, type InventoryEventType, type InventoryItem, type InventoryReceiptStatus, type User } from '@hf/db'
import type { CountReceiptInput, CreateInventoryItemInput, RecordReceiptInput, UpdateInventoryItemInput } from '@hf/contracts'
import { ApiError } from './api'
import { translatePrismaError } from './errors'
import { idempotent } from './idempotency'
import { photoUrls } from './storage'

/**
 * Inventory receiving: a delivery is recorded once (RECEIPT_RECORDED) and
 * counted once (RECEIPT_COUNTED). The receipt row is the projection of those
 * two events; the event row carries the idempotency key, exactly as
 * piece_events does, so a retry on bad wifi replays instead of duplicating.
 */

export type ReceiptPhoto = { id: string; purpose: 'goods' | 'place' | 'document'; url: string }
export type ReceiptLineView = {
  itemId: string; code: string; nameEn: string; nameHi: string; unit: string
  expectedQty: number | null; countedQty: number | null; addedAtCount: boolean; variance: number | null
}
export type ReceiptEventView = { id: string; eventType: InventoryEventType; by: string; createdAt: string; details: unknown }
export type ReceiptView = {
  id: string; status: InventoryReceiptStatus; supplier: string | null; reference: string | null; location: string | null
  note: string | null; countNote: string | null; hasDiscrepancy: boolean; version: number
  receivedBy: string; receivedAt: string; countedBy: string | null; countedAt: string | null
  lines: ReceiptLineView[]; photos: ReceiptPhoto[]; events: ReceiptEventView[]
}
export type ReceiptSummary = {
  id: string; status: InventoryReceiptStatus; supplier: string | null; reference: string | null; hasDiscrepancy: boolean
  receivedBy: string; receivedAt: string; countedBy: string | null; countedAt: string | null
  items: Array<{ code: string; expectedQty: number | null; countedQty: number | null }>
  thumbnailUrl: string | null
}
export type StockRow = { item: InventoryItem; onHand: number; awaitingCount: number }

/** counted − expected, or null when the paper gave no number. */
export const variance = (expected: number | null, counted: number | null): number | null =>
  expected === null || counted === null ? null : counted - expected

/** A line disagrees with the paper when the numbers differ, or when the paper gave none to check against. */
export const lineHasDiscrepancy = (expected: number | null, counted: number | null): boolean =>
  expected === null || counted === null || counted !== expected

const READ_COMMITTED = { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted }

// ---- items -----------------------------------------------------------------

export function listInventoryItems(opts: { includeInactive?: boolean } = {}): Promise<InventoryItem[]> {
  return prisma.inventoryItem.findMany({ where: opts.includeInactive ? {} : { active: true }, orderBy: [{ position: 'asc' }, { code: 'asc' }] })
}

export async function createInventoryItem(input: CreateInventoryItemInput, key: string) {
  // Uppercased here too, not just in the Zod schema: a caller inside the
  // server (this test, or another service) may pass an already-typed input
  // object without routing it through `.parse()` first.
  const code = input.code.toUpperCase()
  try {
    return await idempotent({
      key,
      entity: 'inventory_item',
      run: (tx) => tx.inventoryItem.create({ data: { code, nameEn: input.nameEn, nameHi: input.nameHi, unit: input.unit, position: input.position } }),
      reload: (tx, id) => tx.inventoryItem.findUnique({ where: { id } }),
    })
  } catch (e) {
    translatePrismaError(e, { itemCode: code })
  }
}

/** Names, unit, order and active flag; the code is what old receipts and chips key on, so it never changes. */
export async function updateInventoryItem(id: string, input: UpdateInventoryItemInput): Promise<InventoryItem> {
  const existing = await prisma.inventoryItem.findUnique({ where: { id } })
  if (!existing) throw new ApiError(404, 'item not found', 'not_found')
  return prisma.inventoryItem.update({
    where: { id },
    data: {
      ...(input.nameEn !== undefined ? { nameEn: input.nameEn } : {}),
      ...(input.nameHi !== undefined ? { nameHi: input.nameHi } : {}),
      ...(input.unit !== undefined ? { unit: input.unit } : {}),
      ...(input.position !== undefined ? { position: input.position } : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
    },
  })
}

// ---- receipts --------------------------------------------------------------

/** Every id must be a confirmed photo that nothing else has claimed. Same rule as piece events and style references. */
async function requireFreePhotos(tx: Prisma.TransactionClient, ids: string[]): Promise<void> {
  if (new Set(ids).size !== ids.length) throw new ApiError(422, 'a photo was listed twice', 'attachment_invalid')
  const found = await tx.attachment.count({
    where: { id: { in: ids }, confirmedAt: { not: null }, pieceEventId: null, inventoryReceiptId: null, styleReference: null },
  })
  if (found !== ids.length) throw new ApiError(422, 'photo missing, unconfirmed or already used', 'attachment_invalid')
}

async function requireActiveItems(tx: Prisma.TransactionClient, ids: string[]): Promise<void> {
  if (ids.length === 0) return
  const n = await tx.inventoryItem.count({ where: { id: { in: ids }, active: true } })
  if (n !== ids.length) throw new ApiError(422, 'unknown or inactive item', 'item_invalid')
}

export async function recordReceipt(a: { input: RecordReceiptInput; user: User; idempotencyKey: string }): Promise<{ receipt: ReceiptView; replayed: boolean }> {
  const r = await prisma.$transaction(async (tx) => {
    const existing = await tx.inventoryEvent.findUnique({ where: { idempotencyKey: a.idempotencyKey } })
    if (existing) return { id: existing.receiptId, replayed: true }

    const itemIds = a.input.items.map((l) => l.itemId)
    await requireActiveItems(tx, itemIds)
    const { goods, place, document } = a.input.photos
    await requireFreePhotos(tx, [...goods, ...place, ...document])

    const receipt = await tx.inventoryReceipt.create({
      data: {
        supplier: a.input.supplier || null, reference: a.input.reference || null, location: a.input.location || null, note: a.input.note || null,
        receivedById: a.user.id,
        lines: { create: a.input.items.map((l) => ({ itemId: l.itemId, expectedQty: l.expectedQty ?? null })) },
      },
    })
    for (const [purpose, ids] of [['goods', goods], ['place', place], ['document', document]] as const)
      await tx.attachment.updateMany({ where: { id: { in: ids } }, data: { inventoryReceiptId: receipt.id, purpose } })

    await tx.inventoryEvent.create({
      data: {
        receiptId: receipt.id, eventType: 'RECEIPT_RECORDED', userId: a.user.id, idempotencyKey: a.idempotencyKey,
        details: {
          itemIds, supplier: a.input.supplier ?? null, reference: a.input.reference ?? null, location: a.input.location ?? null, note: a.input.note ?? null,
          suggestions: a.input.suggestions ?? null,
        } as Prisma.InputJsonValue,
      },
    })
    return { id: receipt.id, replayed: false }
  }, READ_COMMITTED)

  const receipt = await getReceipt(r.id)
  if (!receipt) throw new ApiError(404, 'receipt not found', 'not_found')
  return { receipt, replayed: r.replayed }
}

export async function countReceipt(a: { id: string; input: CountReceiptInput; user: User; idempotencyKey: string }): Promise<{ receipt: ReceiptView; replayed: boolean }> {
  const replayed = await prisma.$transaction(async (tx) => {
    const existing = await tx.inventoryEvent.findUnique({ where: { idempotencyKey: a.idempotencyKey } })
    if (existing) return true

    // Row lock: two store users tapping CONFIRM on the same receipt serialise here.
    const locked = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM inventory_receipts WHERE id = ${a.id}::uuid FOR UPDATE`
    if (locked.length === 0) throw new ApiError(404, 'receipt not found', 'not_found')
    const receipt = await tx.inventoryReceipt.findUniqueOrThrow({ where: { id: a.id }, include: { lines: true } })
    if (receipt.status !== 'RECEIVED') throw new ApiError(409, 'this receipt was already counted', 'already_counted')
    if (a.input.expectedVersion !== receipt.version) throw new ApiError(409, 'this receipt changed, open it again', 'version_conflict')

    const known = new Set(receipt.lines.map((l) => l.itemId))
    const given = new Set(a.input.lines.map((l) => l.itemId))
    for (const id of known) if (!given.has(id)) throw new ApiError(422, 'every item on the receipt needs a count', 'line_missing')
    await requireActiveItems(tx, a.input.lines.filter((l) => !known.has(l.itemId)).map((l) => l.itemId))

    let hasDiscrepancy = false
    for (const l of a.input.lines) {
      const expected = l.expectedQty ?? null
      if (lineHasDiscrepancy(expected, l.countedQty)) hasDiscrepancy = true
      await tx.inventoryReceiptLine.upsert({
        where: { receiptId_itemId: { receiptId: a.id, itemId: l.itemId } },
        update: { expectedQty: expected, countedQty: l.countedQty },
        create: { receiptId: a.id, itemId: l.itemId, expectedQty: expected, countedQty: l.countedQty, addedAtCount: true },
      })
    }
    await tx.inventoryReceipt.update({
      where: { id: a.id },
      data: { status: 'COUNTED', hasDiscrepancy, countedById: a.user.id, countedAt: new Date(), version: { increment: 1 } },
    })
    await tx.inventoryEvent.create({
      data: {
        receiptId: a.id, eventType: 'RECEIPT_COUNTED', userId: a.user.id, idempotencyKey: a.idempotencyKey,
        details: {
          lines: a.input.lines.map((l) => ({ itemId: l.itemId, expected: l.expectedQty ?? null, counted: l.countedQty, addedAtCount: !known.has(l.itemId) })),
          note: a.input.note ?? null, hasDiscrepancy,
        } as Prisma.InputJsonValue,
      },
    })
    return false
  }, READ_COMMITTED)

  const receipt = await getReceipt(a.id)
  if (!receipt) throw new ApiError(404, 'receipt not found', 'not_found')
  return { receipt, replayed }
}

const receiptInclude = {
  receivedBy: true, countedBy: true,
  lines: { include: { item: true }, orderBy: [{ item: { position: 'asc' as const } }, { item: { code: 'asc' as const } }] },
  attachments: { orderBy: { takenAt: 'asc' as const } },
  events: { include: { user: true }, orderBy: { createdAt: 'asc' as const } },
} satisfies Prisma.InventoryReceiptInclude

export async function getReceipt(id: string): Promise<ReceiptView | null> {
  const r = await prisma.inventoryReceipt.findUnique({ where: { id }, include: receiptInclude })
  if (!r) return null
  const signed = await photoUrls(r.attachments.map((p) => p.storageKey))
  const countEvent = r.events.find((e) => e.eventType === 'RECEIPT_COUNTED')
  const countNote = (countEvent?.details as { note?: unknown } | null)?.note
  return {
    id: r.id, status: r.status, supplier: r.supplier, reference: r.reference, location: r.location, note: r.note,
    countNote: typeof countNote === 'string' ? countNote : null,
    hasDiscrepancy: r.hasDiscrepancy, version: r.version,
    receivedBy: r.receivedBy.name, receivedAt: r.receivedAt.toISOString(),
    countedBy: r.countedBy?.name ?? null, countedAt: r.countedAt?.toISOString() ?? null,
    lines: r.lines.map((l) => ({
      itemId: l.itemId, code: l.item.code, nameEn: l.item.nameEn, nameHi: l.item.nameHi, unit: l.item.unit,
      expectedQty: l.expectedQty, countedQty: l.countedQty, addedAtCount: l.addedAtCount, variance: variance(l.expectedQty, l.countedQty),
    })),
    photos: r.attachments.flatMap((p) => {
      const url = signed.get(p.storageKey)
      return url && p.purpose ? [{ id: p.id, purpose: p.purpose, url }] : []
    }),
    events: r.events.map((e) => ({ id: e.id, eventType: e.eventType, by: e.user.name, createdAt: e.createdAt.toISOString(), details: e.details })),
  }
}

/** `"<iso receivedAt>|<id>"`; malformed parses to null and is ignored. */
function parseCursor(before: string | undefined): { at: Date; id: string } | null {
  if (!before) return null
  const i = before.indexOf('|')
  if (i < 0) return null
  const at = new Date(before.slice(0, i))
  const id = before.slice(i + 1)
  return Number.isNaN(at.getTime()) || !id ? null : { at, id }
}

export async function listReceipts(q: { status?: InventoryReceiptStatus; discrepancy?: boolean; receivedById?: string; limit?: number; before?: string } = {}): Promise<{ receipts: ReceiptSummary[]; nextBefore: string | null }> {
  const limit = Math.min(Math.max(q.limit ?? 50, 1), 200)
  const cursor = parseCursor(q.before)
  const rows = await prisma.inventoryReceipt.findMany({
    where: {
      ...(q.status ? { status: q.status } : {}),
      ...(q.discrepancy ? { hasDiscrepancy: true } : {}),
      ...(q.receivedById ? { receivedById: q.receivedById } : {}),
      ...(cursor ? { OR: [{ receivedAt: { lt: cursor.at } }, { receivedAt: cursor.at, id: { lt: cursor.id } }] } : {}),
    },
    orderBy: [{ receivedAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    include: { receivedBy: true, countedBy: true, lines: { include: { item: true }, orderBy: [{ item: { position: 'asc' } }, { item: { code: 'asc' } }] }, attachments: { where: { purpose: 'goods' }, orderBy: { takenAt: 'asc' }, take: 1 } },
  })
  const page = rows.slice(0, limit)
  const signed = await photoUrls(page.flatMap((r) => r.attachments.map((p) => p.storageKey)))
  const last = page[page.length - 1]
  return {
    receipts: page.map((r) => ({
      id: r.id, status: r.status, supplier: r.supplier, reference: r.reference, hasDiscrepancy: r.hasDiscrepancy,
      receivedBy: r.receivedBy.name, receivedAt: r.receivedAt.toISOString(), countedBy: r.countedBy?.name ?? null, countedAt: r.countedAt?.toISOString() ?? null,
      items: r.lines.map((l) => ({ code: l.item.code, expectedQty: l.expectedQty, countedQty: l.countedQty })),
      thumbnailUrl: r.attachments[0] ? (signed.get(r.attachments[0].storageKey) ?? null) : null,
    })),
    nextBefore: rows.length > limit && last ? `${last.receivedAt.toISOString()}|${last.id}` : null,
  }
}

/** On hand = counted quantities on COUNTED receipts. Awaiting = RECEIVED receipts that list the item. */
export async function stockOnHand(): Promise<StockRow[]> {
  const [items, counted, awaiting] = await Promise.all([
    prisma.inventoryItem.findMany({ orderBy: [{ position: 'asc' }, { code: 'asc' }] }),
    prisma.inventoryReceiptLine.groupBy({ by: ['itemId'], where: { receipt: { status: 'COUNTED' } }, _sum: { countedQty: true } }),
    prisma.inventoryReceiptLine.groupBy({ by: ['itemId'], where: { receipt: { status: 'RECEIVED' } }, _count: { _all: true } }),
  ])
  const onHand = new Map(counted.map((c) => [c.itemId, c._sum.countedQty ?? 0]))
  const waiting = new Map(awaiting.map((c) => [c.itemId, c._count._all]))
  return items.map((item) => ({ item, onHand: onHand.get(item.id) ?? 0, awaitingCount: waiting.get(item.id) ?? 0 }))
}
