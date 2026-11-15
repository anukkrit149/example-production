import { beforeEach, describe, expect, it } from 'vitest'
import { testPrisma } from '@hf/db/test'
import type { SeedResult } from '@hf/db'
import { changeQuantity, createLineItem, exportLabels, listBatches, listLabels, markBatchPrinted, batchFile, runPieceAction } from '@hf/server'
import { freshSeed } from './helpers'

let seed: SeedResult
const photo = async () =>
  (await testPrisma.attachment.create({ data: { storageKey: `t/${crypto.randomUUID()}.jpg`, mime: 'image/jpeg', bytes: 1, takenById: seed.users.store.id } })).id

describe('labels service', () => {
  beforeEach(async () => { seed = await freshSeed() })

  it('a new line item gets one pending planned label per piece, in the same transaction', async () => {
    const order = await testPrisma.order.findFirstOrThrow()
    const bag = await testPrisma.style.findUniqueOrThrow({ where: { styleCode: 'TB-018' } })
    const { lineItem } = await createLineItem({ orderId: order.id, styleId: bag.id, size: 'ONE', shade: 'RED-01', quantity: 4 }, 'k-li-1', seed.users.merchandiser.id)
    const labels = await listLabels({ kind: 'planned', status: 'pending', lineItemId: lineItem.id })
    expect(labels).toHaveLength(4)
    expect(labels.map((l) => l.serial)).toEqual([1, 2, 3, 4])
    expect(labels[0]!.stage).toBeNull()
    expect(labels[0]!.template).toBe('t50x25')
  })

  it('a quantity increase adds planned labels; a decrease voids the unprinted ones of the cancelled pieces', async () => {
    const li = seed.lineItems[0]!  // 20 jackets
    await changeQuantity({ lineItemId: li.id, input: { quantity: 22 }, user: seed.users.merchandiser, idempotencyKey: 'q-up' })
    expect(await listLabels({ kind: 'planned', status: 'pending', lineItemId: li.id })).toHaveLength(22)
    await changeQuantity({ lineItemId: li.id, input: { quantity: 20, reason: 'buyer cut' }, user: seed.users.merchandiser, idempotencyKey: 'q-down' })
    expect(await listLabels({ kind: 'planned', status: 'pending', lineItemId: li.id })).toHaveLength(20)
    expect(await testPrisma.piece.count({ where: { lineItemId: li.id, state: 'CANCELLED' } })).toBe(2)
  })

  it('a printed planned label survives cancellation', async () => {
    const li = seed.lineItems[0]!
    const pending = await listLabels({ kind: 'planned', status: 'pending', lineItemId: li.id })
    const last = pending[pending.length - 1]!
    const { batch } = await exportLabels({ kind: 'planned', format: 'csv', labelIds: [last.id], user: seed.users.merchandiser })
    await markBatchPrinted(batch.id, 1)
    await changeQuantity({ lineItemId: li.id, input: { quantity: 19, reason: 'buyer cut' }, user: seed.users.merchandiser, idempotencyKey: 'q-down-2' })
    const printed = await testPrisma.labelPrint.findUniqueOrThrow({ where: { id: last.id } })
    expect(printed.printedAt).not.toBeNull()
  })

  it('exports every pending planned label of a line item as CSV, stamps them, and the batch can be re-downloaded', async () => {
    const li = seed.lineItems[2]!  // 30 bags
    const r = await exportLabels({ kind: 'planned', format: 'csv', lineItemId: li.id, user: seed.users.merchandiser })
    expect(r.batch.labelCount).toBe(30)
    expect(r.batch.kind).toBe('planned')
    expect(r.filename).toBe(`labels-planned-${r.batch.id}.csv`)
    const text = new TextDecoder().decode(r.body)
    expect(text.split('\r\n')[0]).toBe('QR_VALUE,STAGE_TEXT,STYLE_LINE,DETAIL_LINE,QTY_LINE,CHECK_LINE,PRINT_DATE')
    expect(text).toContain('PLANNED,STYLE TB-018,ONE / TAN-01 / 0001,1 PC')
    expect(await listLabels({ kind: 'planned', status: 'pending', lineItemId: li.id })).toHaveLength(0)
    const again = await batchFile(r.batch.id)
    expect(new TextDecoder().decode(again.body)).toBe(text)
    // A second export of the same scope has nothing left and refuses.
    await expect(exportLabels({ kind: 'planned', format: 'csv', lineItemId: li.id, user: seed.users.merchandiser })).rejects.toMatchObject({ code: 'label_mismatch' })
  })

  it('stage labels still export as before, by stage', async () => {
    const p = seed.pieces[0]!
    await runPieceAction({ pieceId: p.id, user: seed.users.store, idempotencyKey: 'a1', event: { type: 'PIECE_ACTIVATED', stage: 'cutting' }, attachmentIds: [await photo()] })
    await runPieceAction({ pieceId: p.id, user: seed.users.qa, idempotencyKey: 'q1', event: { type: 'STAGE_QA_PASSED', stage: 'cutting' }, attachmentIds: [await photo()] })
    const pending = await listLabels({ kind: 'stage', stage: 'cutting', status: 'pending' })
    expect(pending).toHaveLength(1)
    const r = await exportLabels({ kind: 'stage', stage: 'cutting', format: 'xlsx', labelIds: [pending[0]!.id], user: seed.users.store })
    expect(r.contentType).toContain('spreadsheetml')
    const batches = await listBatches()
    expect(batches[0]).toMatchObject({ kind: 'stage', stage: 'cutting', labelCount: 1, printedAt: null, createdBy: 'Store Operator' })
  })

  it('marking a batch printed twice is a 409', async () => {
    const li = seed.lineItems[1]!
    const { batch } = await exportLabels({ kind: 'planned', format: 'csv', lineItemId: li.id, user: seed.users.merchandiser })
    await markBatchPrinted(batch.id, 2)
    await expect(markBatchPrinted(batch.id, 1)).rejects.toMatchObject({ status: 409 })
    expect((await listBatches())[0]).toMatchObject({ copies: 2 })
  })
})
