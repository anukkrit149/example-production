import { beforeEach, describe, expect, it } from 'vitest'
import { resetTestDb, testPrisma } from '@hf/db/test'
import { seedAll, type SeedResult } from '@hf/db'
import { countReceipt, createInventoryItem, getReceipt, listReceipts, recordReceipt, stockOnHand, updateInventoryItem } from '@hf/server'

// No storage mock: `photoUrls` presigns locally with the S3 vars from .env and
// never touches the network, so the signed urls below are real ones.

let seed: SeedResult

const photo = async (opts: { confirmed?: boolean } = {}) =>
  (await testPrisma.attachment.create({ data: { storageKey: `t/${crypto.randomUUID()}.jpg`, mime: 'image/jpeg', bytes: 1, takenById: seed.users.qa.id, confirmedAt: opts.confirmed === false ? null : new Date() } })).id

const photos = async () => ({ goods: [await photo()], place: [await photo()], document: [await photo()] })

const record = async (over: Partial<Parameters<typeof recordReceipt>[0]['input']> = {}, key = crypto.randomUUID()) =>
  recordReceipt({ user: seed.users.qa, idempotencyKey: key, input: { attachmentIds: [], items: [{ itemId: seed.items[0]!.id, expectedQty: 500 }, { itemId: seed.items[1]!.id }], photos: await photos(), supplier: 'Rex Zips', reference: 'DC-1182', ...over } })

describe('inventory service', () => {
  beforeEach(async () => { await resetTestDb(); seed = await seedAll(testPrisma) })

  it('records a receipt: lines, three linked photos with purposes, one RECEIPT_RECORDED event', async () => {
    const { receipt, replayed } = await record()
    expect(replayed).toBe(false)
    expect(receipt.status).toBe('RECEIVED')
    expect(receipt.lines.map((l) => [l.code, l.expectedQty, l.countedQty])).toEqual([['ZIP', 500, null], ['WASH-LBL', null, null]])
    expect(receipt.photos.map((p) => p.purpose).sort()).toEqual(['document', 'goods', 'place'])
    expect(receipt.photos[0]!.url).toMatch(/^http/)
    expect(receipt.events.map((e) => e.eventType)).toEqual(['RECEIPT_RECORDED'])
    expect(receipt.receivedBy).toBe('QA Checker')
    const linked = await testPrisma.attachment.count({ where: { inventoryReceiptId: receipt.id } })
    expect(linked).toBe(3)
  })

  it('replays on the same idempotency key without a second receipt', async () => {
    const key = 'rec-1234567890'
    const first = await record({}, key)
    const second = await record({}, key)
    expect(second.replayed).toBe(true)
    expect(second.receipt.id).toBe(first.receipt.id)
    expect(await testPrisma.inventoryReceipt.count()).toBe(1)
  })

  it('refuses unconfirmed, already-used or unknown photos, and inactive items', async () => {
    await expect(record({ photos: { goods: [await photo({ confirmed: false })], place: [await photo()], document: [await photo()] } })).rejects.toMatchObject({ status: 422, code: 'attachment_invalid' })
    const used = await photo()
    await record({ photos: { goods: [used], place: [await photo()], document: [await photo()] } })
    await expect(record({ photos: { goods: [used], place: [await photo()], document: [await photo()] } })).rejects.toMatchObject({ status: 422, code: 'attachment_invalid' })
    await expect(record({ photos: { goods: [crypto.randomUUID()], place: [await photo()], document: [await photo()] } })).rejects.toMatchObject({ status: 422, code: 'attachment_invalid' })
    await updateInventoryItem(seed.items[2]!.id, { active: false })
    await expect(record({ items: [{ itemId: seed.items[2]!.id }] })).rejects.toMatchObject({ status: 422, code: 'item_invalid' })
  })

  it('refuses a confirmed photo already claimed as a style reference', async () => {
    const referenced = await photo()
    await testPrisma.style.create({ data: { styleCode: 'LJ-REF1', category: 'jacket', gender: 'mens', referenceAttachmentId: referenced } })
    await expect(record({ photos: { goods: [referenced], place: [await photo()], document: [await photo()] } })).rejects.toMatchObject({ status: 422, code: 'attachment_invalid' })
  })

  it('counts once, flags a short line, allows an added line, bumps the version', async () => {
    const { receipt } = await record()
    const counted = await countReceipt({ id: receipt.id, user: seed.users.store, idempotencyKey: 'cnt-1234567890', input: { attachmentIds: [], expectedVersion: 0, lines: [
      { itemId: seed.items[0]!.id, expectedQty: 500, countedQty: 480 },
      { itemId: seed.items[1]!.id, expectedQty: 200, countedQty: 200 },
      { itemId: seed.items[2]!.id, expectedQty: 50, countedQty: 50 },
    ], note: 'one box open' } })
    expect(counted.receipt.status).toBe('COUNTED')
    expect(counted.receipt.hasDiscrepancy).toBe(true)
    expect(counted.receipt.version).toBe(1)
    expect(counted.receipt.countedBy).toBe('Store Operator')
    expect(counted.receipt.countNote).toBe('one box open')
    expect(counted.receipt.lines.map((l) => [l.code, l.variance, l.addedAtCount])).toEqual([['ZIP', -20, false], ['WASH-LBL', 0, false], ['PO-LBL', 0, true]])
    expect(counted.receipt.events.map((e) => e.eventType)).toEqual(['RECEIPT_RECORDED', 'RECEIPT_COUNTED'])

    await expect(countReceipt({ id: receipt.id, user: seed.users.store, idempotencyKey: 'cnt-2234567890', input: { attachmentIds: [], expectedVersion: 1, lines: [{ itemId: seed.items[0]!.id, countedQty: 1 }] } })).rejects.toMatchObject({ status: 409, code: 'already_counted' })
    const again = await countReceipt({ id: receipt.id, user: seed.users.store, idempotencyKey: 'cnt-1234567890', input: { attachmentIds: [], expectedVersion: 0, lines: [{ itemId: seed.items[0]!.id, countedQty: 1 }] } })
    expect(again.replayed).toBe(true)
  })

  it('a stale version, a missing line, or an unknown receipt is refused', async () => {
    const { receipt } = await record()
    await expect(countReceipt({ id: receipt.id, user: seed.users.store, idempotencyKey: 'cnt-3234567890', input: { attachmentIds: [], expectedVersion: 7, lines: [{ itemId: seed.items[0]!.id, countedQty: 1 }, { itemId: seed.items[1]!.id, countedQty: 1 }] } })).rejects.toMatchObject({ status: 409, code: 'version_conflict' })
    await expect(countReceipt({ id: receipt.id, user: seed.users.store, idempotencyKey: 'cnt-4234567890', input: { attachmentIds: [], expectedVersion: 0, lines: [{ itemId: seed.items[0]!.id, countedQty: 1 }] } })).rejects.toMatchObject({ status: 422, code: 'line_missing' })
    await expect(countReceipt({ id: crypto.randomUUID(), user: seed.users.store, idempotencyKey: 'cnt-5234567890', input: { attachmentIds: [], expectedVersion: 0, lines: [{ itemId: seed.items[0]!.id, countedQty: 1 }] } })).rejects.toMatchObject({ status: 404 })
  })

  it('a line with no expected quantity still flags the receipt', async () => {
    const { receipt } = await record({ items: [{ itemId: seed.items[0]!.id }] })
    const counted = await countReceipt({ id: receipt.id, user: seed.users.admin, idempotencyKey: 'cnt-6234567890', input: { attachmentIds: [], expectedVersion: 0, lines: [{ itemId: seed.items[0]!.id, countedQty: 10 }] } })
    expect(counted.receipt.hasDiscrepancy).toBe(true)
    expect(counted.receipt.lines[0]!.variance).toBeNull()
  })

  it('stock on hand sums counted receipts only; awaiting count counts RECEIVED receipts per item', async () => {
    const a = await record()
    await record({ items: [{ itemId: seed.items[0]!.id, expectedQty: 100 }] })
    await countReceipt({ id: a.receipt.id, user: seed.users.store, idempotencyKey: 'cnt-7234567890', input: { attachmentIds: [], expectedVersion: 0, lines: [{ itemId: seed.items[0]!.id, expectedQty: 500, countedQty: 480 }, { itemId: seed.items[1]!.id, expectedQty: 200, countedQty: 200 }] } })
    const stock = await stockOnHand()
    expect(stock.map((s) => [s.item.code, s.onHand, s.awaitingCount])).toEqual([['ZIP', 480, 1], ['WASH-LBL', 200, 0], ['PO-LBL', 0, 0]])
  })

  it('lists newest first with filters and a keyset cursor', async () => {
    const a = await record()
    await new Promise((r) => setTimeout(r, 5))
    const b = await record({ items: [{ itemId: seed.items[2]!.id }] })
    await countReceipt({ id: a.receipt.id, user: seed.users.store, idempotencyKey: 'cnt-8234567890', input: { attachmentIds: [], expectedVersion: 0, lines: [{ itemId: seed.items[0]!.id, expectedQty: 500, countedQty: 1 }, { itemId: seed.items[1]!.id, expectedQty: 1, countedQty: 1 }] } })
    const all = await listReceipts()
    expect(all.receipts.map((r) => r.id)).toEqual([b.receipt.id, a.receipt.id])
    expect(all.receipts[1]!.items.map((i) => i.code)).toEqual(['ZIP', 'WASH-LBL'])
    expect(all.receipts[0]!.thumbnailUrl).toMatch(/^http/)
    expect((await listReceipts({ status: 'RECEIVED' })).receipts.map((r) => r.id)).toEqual([b.receipt.id])
    expect((await listReceipts({ discrepancy: true })).receipts.map((r) => r.id)).toEqual([a.receipt.id])
    expect((await listReceipts({ receivedById: seed.users.store.id })).receipts).toEqual([])
    const page1 = await listReceipts({ limit: 1 })
    expect(page1.receipts).toHaveLength(1)
    expect(page1.nextBefore).toBeTruthy()
    const page2 = await listReceipts({ limit: 1, before: page1.nextBefore! })
    expect(page2.receipts.map((r) => r.id)).toEqual([a.receipt.id])
    expect(page2.nextBefore).toBeNull()
    expect(await getReceipt(crypto.randomUUID())).toBeNull()
  })

  it('items: create is idempotent and uppercases the code; a duplicate is a readable 409; update never touches the code', async () => {
    const first = await createInventoryItem({ code: 'btn', nameEn: 'Button', nameHi: 'बटन', unit: 'pcs', position: 4 }, 'item-1234567890')
    expect(first.result.code).toBe('BTN')
    const again = await createInventoryItem({ code: 'btn', nameEn: 'Button', nameHi: 'बटन', unit: 'pcs', position: 4 }, 'item-1234567890')
    expect(again.replayed).toBe(true)
    await expect(createInventoryItem({ code: 'ZIP', nameEn: 'Zip 2', nameHi: 'ज़िप', unit: 'pcs', position: 9 }, 'item-2234567890')).rejects.toMatchObject({ status: 409, message: 'Item code ZIP is already taken' })
    const updated = await updateInventoryItem(first.result.id, { nameEn: 'Snap button', active: false })
    expect(updated).toMatchObject({ code: 'BTN', nameEn: 'Snap button', active: false })
  })
})
