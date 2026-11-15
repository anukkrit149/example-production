import { DEFAULT_CHECKLISTS, scopeKey } from '@hf/domain'
import type { PrismaClient, User, Worker, OrderLineItem, Piece, InventoryItem } from './generated/client'

export type SeedResult = {
  users: Record<'admin' | 'store' | 'qa' | 'supervisor' | 'merchandiser' | 'management', User>
  workers: Worker[]
  lineItems: OrderLineItem[]
  pieces: Piece[]
  items: InventoryItem[]
}

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
function seedToken(n: number) {
  let s = ''
  let x = n
  for (let i = 0; i < 4; i++) { s = ALPHABET[x % ALPHABET.length] + s; x = Math.floor(x / ALPHABET.length) }
  return `HF-P-SEED${s}`
}

export async function seedAll(db: PrismaClient): Promise<SeedResult> {
  const mk = async (name: string, role: User['role']) =>
    db.user.upsert({ where: { authIdentity: `dev:${role}` }, update: {}, create: { name, role, authIdentity: `dev:${role}` } })
  const users = {
    admin: await mk('Admin', 'admin'),
    store: await mk('Store Operator', 'store'),
    qa: await mk('QA Checker', 'qa'),
    supervisor: await mk('Supervisor', 'supervisor'),
    merchandiser: await mk('Merchandiser', 'merchandiser'),
    management: await mk('Management', 'management'),
  }

  const workerSpecs: Array<[string, Worker['type']]> = [
    ['Cutter One', 'cutter'], ['Paster One', 'paster'], ['Tailor One', 'tailor'], ['Tailor Two', 'tailor'], ['Finisher One', 'finisher'],
  ]
  const workers: Worker[] = []
  for (const [name, type] of workerSpecs) {
    const existing = await db.worker.findFirst({ where: { name, type } })
    workers.push(existing ?? (await db.worker.create({ data: { name, type } })))
  }

  const buyer = (await db.organization.findFirst({ where: { name: 'Nordheim GmbH' } }))
    ?? (await db.organization.create({ data: { type: 'buyer', name: 'Nordheim GmbH' } }))
  const agent = (await db.organization.findFirst({ where: { name: 'Pacific Sourcing' } }))
    ?? (await db.organization.create({ data: { type: 'agent', name: 'Pacific Sourcing' } }))

  const program = (await db.program.findFirst({ where: { name: 'Autumn 26' } }))
    ?? (await db.program.create({ data: { buyerId: buyer.id, agentId: agent.id, name: 'Autumn 26', season: 'AW26' } }))

  const jacket = await db.style.upsert({ where: { styleCode: 'LJ-204' }, update: {}, create: { styleCode: 'LJ-204', category: 'jacket', gender: 'mens', ownerId: buyer.id, description: 'Coach jacket, lamb' } })
  const bag = await db.style.upsert({ where: { styleCode: 'TB-018' }, update: {}, create: { styleCode: 'TB-018', category: 'bag', gender: 'unisex', ownerId: buyer.id, description: 'Tote' } })

  const order = await db.order.upsert({
    where: { programId_orderNumber: { programId: program.id, orderNumber: 'PO-4471' } },
    update: {}, create: { programId: program.id, orderNumber: 'PO-4471', dueDate: new Date('2026-11-15') },
  })

  const liSpecs = [
    { styleId: jacket.id, size: 'M', shade: 'BLK-02', quantity: 20 },
    { styleId: jacket.id, size: 'L', shade: 'BLK-02', quantity: 15 },
    { styleId: bag.id, size: 'ONE', shade: 'TAN-01', quantity: 30 },
  ]
  const lineItems: OrderLineItem[] = []
  const pieces: Piece[] = []
  let tokenCounter = 0
  for (const spec of liSpecs) {
    const li = await db.orderLineItem.upsert({
      where: {
        orderId_styleId_size_shade: {
          orderId: order.id,
          styleId: spec.styleId,
          size: spec.size,
          shade: spec.shade,
        },
      },
      update: {}, create: { orderId: order.id, ...spec },
    })
    lineItems.push(li)
    for (let serial = 1; serial <= spec.quantity; serial++) {
      tokenCounter++
      const piece = await db.piece.upsert({
        where: { lineItemId_serial: { lineItemId: li.id, serial } },
        update: {}, create: { lineItemId: li.id, serial, qrToken: seedToken(tokenCounter) },
      })
      pieces.push(piece)
    }
  }

  // Every planned piece carries a planned label request from the start.
  for (const piece of pieces) {
    const has = await db.labelPrint.count({ where: { pieceId: piece.id, kind: 'planned' } })
    if (has === 0) await db.labelPrint.create({ data: { pieceId: piece.id, kind: 'planned', stage: null, template: 't50x25', requestedById: users.merchandiser.id } })
  }
  await seedChecklists(db)

  const itemSpecs: Array<[string, string, string, number]> = [
    ['ZIP', 'Zip', 'ज़िप', 1],
    ['WASH-LBL', 'Wash-care label', 'वॉश लेबल', 2],
    ['PO-LBL', 'PO label', 'PO लेबल', 3],
  ]
  const items: InventoryItem[] = []
  for (const [code, nameEn, nameHi, position] of itemSpecs)
    items.push(await db.inventoryItem.upsert({ where: { code }, update: {}, create: { code, nameEn, nameHi, position } }))

  return { users, workers, lineItems, pieces, items }
}

/** One published version per factory default. Idempotent: a checklist that already has any version is left alone. */
export async function seedChecklists(db: PrismaClient): Promise<number> {
  let created = 0
  for (const d of DEFAULT_CHECKLISTS) {
    const key = scopeKey(d.step, d.stage, d.category, null)
    const list = await db.checklist.upsert({
      where: { scopeKey: key },
      update: {},
      create: { step: d.step, stage: d.stage, category: d.category, programId: null, scopeKey: key },
    })
    const existing = await db.checklistVersion.count({ where: { checklistId: list.id } })
    if (existing > 0) continue
    await db.checklistVersion.create({
      data: {
        checklistId: list.id, number: 1, publishedAt: new Date(),
        items: { create: d.items.map((it, i) => ({ position: i + 1, kind: it.kind, textEn: it.en, textHi: it.hi, pictogram: it.pictogram })) },
      },
    })
    created++
  }
  return created
}
