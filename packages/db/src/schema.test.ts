import { beforeEach, describe, expect, it } from 'vitest'
import { resetTestDb, testPrisma } from './test-db'

describe('schema', () => {
  beforeEach(resetTestDb)

  it('rejects two pieces with the same qr token', async () => {
    const buyer = await testPrisma.organization.create({ data: { type: 'buyer', name: 'Nordheim' } })
    const program = await testPrisma.program.create({ data: { buyerId: buyer.id, name: 'Autumn 26' } })
    const style = await testPrisma.style.create({ data: { styleCode: 'LJ-204', category: 'jacket', gender: 'mens' } })
    const order = await testPrisma.order.create({ data: { programId: program.id, orderNumber: 'PO-1' } })
    const li = await testPrisma.orderLineItem.create({ data: { orderId: order.id, styleId: style.id, size: 'M', shade: 'BLK-02', quantity: 2 } })
    await testPrisma.piece.create({ data: { lineItemId: li.id, qrToken: 'HF-P-AAAAAAAA', serial: 1 } })
    await expect(
      testPrisma.piece.create({ data: { lineItemId: li.id, qrToken: 'HF-P-AAAAAAAA', serial: 2 } }),
    ).rejects.toThrow(/Unique constraint/)
  })

  it('rejects two events with the same idempotency key', async () => {
    const user = await testPrisma.user.create({ data: { name: 'AK', role: 'store', authIdentity: 'dev:ak' } })
    const buyer = await testPrisma.organization.create({ data: { type: 'buyer', name: 'N' } })
    const program = await testPrisma.program.create({ data: { buyerId: buyer.id, name: 'P' } })
    const style = await testPrisma.style.create({ data: { styleCode: 'S', category: 'bag', gender: 'unisex' } })
    const order = await testPrisma.order.create({ data: { programId: program.id, orderNumber: 'PO-2' } })
    const li = await testPrisma.orderLineItem.create({ data: { orderId: order.id, styleId: style.id, size: 'ONE', shade: 'TAN', quantity: 1 } })
    const piece = await testPrisma.piece.create({ data: { lineItemId: li.id, qrToken: 'HF-P-BBBBBBBB', serial: 1 } })
    const data = { pieceId: piece.id, eventType: 'PIECE_ACTIVATED' as const, stage: 'cutting' as const, userId: user.id, idempotencyKey: 'k1' }
    await testPrisma.pieceEvent.create({ data })
    await expect(testPrisma.pieceEvent.create({ data })).rejects.toThrow(/Unique constraint/)
  })

  it('mutation_keys exists and rejects a duplicate key', async () => {
    const id = '11111111-1111-4111-8111-111111111111'
    await testPrisma.mutationKey.create({ data: { key: 'k', entity: 'order', entityId: id } })
    await expect(testPrisma.mutationKey.create({ data: { key: 'k', entity: 'order', entityId: id } })).rejects.toThrow(/Unique constraint/)
  })

  it('label prints carry a kind and an optional stage; checklists exist', async () => {
    const cols = await testPrisma.$queryRaw<Array<{ table_name: string; column_name: string; is_nullable: string }>>`
      SELECT table_name, column_name, is_nullable FROM information_schema.columns
      WHERE table_name IN ('label_prints', 'export_batches', 'checklists', 'checklist_versions', 'checklist_items')`
    const has = (t: string, c: string) => cols.some((x) => x.table_name === t && x.column_name === c)
    expect(has('label_prints', 'kind')).toBe(true)
    expect(cols.find((x) => x.table_name === 'label_prints' && x.column_name === 'stage')?.is_nullable).toBe('YES')
    expect(has('export_batches', 'kind')).toBe(true)
    expect(has('checklists', 'scope_key')).toBe(true)
    expect(has('checklist_versions', 'published_at')).toBe(true)
    expect(has('checklist_items', 'text_hi')).toBe(true)
  })

  it('inventory tables exist; an attachment may point at a receipt with a purpose', async () => {
    const cols = await testPrisma.$queryRaw<Array<{ table_name: string; column_name: string }>>`
      SELECT table_name, column_name FROM information_schema.columns
      WHERE table_name IN ('inventory_items', 'inventory_receipts', 'inventory_receipt_lines', 'inventory_events', 'attachments')`
    const has = (t: string, c: string) => cols.some((x) => x.table_name === t && x.column_name === c)
    expect(has('inventory_items', 'name_hi')).toBe(true)
    expect(has('inventory_receipts', 'has_discrepancy')).toBe(true)
    expect(has('inventory_receipt_lines', 'added_at_count')).toBe(true)
    expect(has('inventory_events', 'idempotency_key')).toBe(true)
    expect(has('attachments', 'inventory_receipt_id')).toBe(true)
    expect(has('attachments', 'purpose')).toBe(true)
  })

  it('a receipt cannot carry the same item twice', async () => {
    const user = await testPrisma.user.create({ data: { name: 'S', role: 'store', authIdentity: 'dev:s' } })
    const item = await testPrisma.inventoryItem.create({ data: { code: 'ZIP', nameEn: 'Zip', nameHi: 'ज़िप' } })
    const receipt = await testPrisma.inventoryReceipt.create({ data: { receivedById: user.id } })
    await testPrisma.inventoryReceiptLine.create({ data: { receiptId: receipt.id, itemId: item.id } })
    await expect(testPrisma.inventoryReceiptLine.create({ data: { receiptId: receipt.id, itemId: item.id } })).rejects.toThrow(/Unique constraint/)
  })

  it('checklist items can be measurements with a unit and range', async () => {
    const list = await testPrisma.checklist.create({ data: { step: 'qa', stage: 'stitching', category: 'jacket', scopeKey: 'qa|stitching|jacket|test' } })
    const v = await testPrisma.checklistVersion.create({ data: { checklistId: list.id, number: 1 } })
    const item = await testPrisma.checklistItem.create({ data: { versionId: v.id, position: 1, kind: 'measure', textEn: 'Arm hole', textHi: 'आर्म होल', pictogram: 'measure', unit: 'cm', min: 44, max: 46 } })
    expect(item.unit).toBe('cm')
    expect(Number(item.min)).toBe(44)
  })
})
