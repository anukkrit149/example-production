import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resetTestDb, testPrisma } from '@hf/db/test'
import { seedAll, type SeedResult } from '@hf/db'
import { changeQuantity, createLineItem } from '@hf/server'

const cookie = { value: 'dev:store' }
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (n: string) => (n === 'hf_dev_user' && cookie.value ? { value: cookie.value } : undefined) }),
}))

const scan = await import('@/app/api/scan/[token]/route')
const checklists = await import('@/app/api/checklists/route')
const activate = await import('@/app/api/pieces/activate/route')
const lineItems = await import('@/app/api/line-items/route')
const printQueue = await import('@/app/api/print-queue/route')
const qa = await import('@/app/api/pieces/[id]/qa/route')

let seed: SeedResult
const post = (body: unknown, key = crypto.randomUUID()) =>
  new Request('http://x', { method: 'POST', body: JSON.stringify(body), headers: { 'idempotency-key': key } })
const params = (p: Record<string, string>) => ({ params: Promise.resolve(p) })
const photo = async () =>
  (await testPrisma.attachment.create({ data: { storageKey: `t/${crypto.randomUUID()}.jpg`, mime: 'image/jpeg', bytes: 1, takenById: seed.users.store.id } })).id

/** Fetch the resolved checklist for a piece and answer every item true (materials get one line). */
async function answered(pieceId: string, step: string, stage: string | null) {
  const res = await checklists.GET(new Request(`http://x/api/checklists?pieceId=${pieceId}&step=${step}${stage ? `&stage=${stage}` : ''}`), params({}))
  const { checklist } = await res.json()
  return { versionId: checklist.id, answers: checklist.items.map((i: { id: string; kind: string }) => ({ itemId: i.id, value: true, ...(i.kind === 'materials' ? { materials: [{ code: 'ZIP-01', qty: 1, unit: 'pc' }] } : {}) })) }
}

describe('office to floor', () => {
  let orderId: string
  let bagId: string

  beforeEach(async () => {
    await resetTestDb()
    seed = await seedAll(testPrisma)
    process.env.DEV_AUTH = 'true'
    cookie.value = 'dev:store'
    orderId = (await testPrisma.order.findFirstOrThrow()).id
    bagId = (await testPrisma.style.findUniqueOrThrow({ where: { styleCode: 'TB-018' } })).id
  })

  it('a line item created by the office appears on the cutting bench and its first piece can be scanned and cut', async () => {
    const { lineItem } = await createLineItem({ orderId, styleId: bagId, size: 'ONE', shade: 'RED-04', quantity: 6 }, 'o2f-1', seed.users.merchandiser.id)

    // The bench list the ActivateForm reads.
    const listRes = await lineItems.GET(new Request('http://x'), params({}))
    const list = (await listRes.json()).lineItems as Array<{ id: string; planned: number; cut: number; shade: string }>
    const mine = list.find((l) => l.id === lineItem.id)
    expect(mine).toMatchObject({ shade: 'RED-04', planned: 6, cut: 0 })

    // Scan one of the freshly generated tokens: same context, same actions as a seeded piece.
    const first = await testPrisma.piece.findFirstOrThrow({ where: { lineItemId: lineItem.id, serial: 1 } })
    const scanRes = await scan.GET(new Request('http://x'), params({ token: first.qrToken.toLowerCase() }))
    expect(scanRes.status).toBe(200)
    expect(await scanRes.json()).toMatchObject({ state: 'PLANNED', actions: ['activate', 'cancel'], styleCode: 'TB-018', size: 'ONE', shade: 'RED-04', orderNumber: 'PO-4471' })

    // Activate picks the lowest PLANNED serial, exactly as for seeded pieces.
    const actRes = await activate.POST(post({ lineItemId: lineItem.id, leatherLot: 'LOT-9', attachmentIds: [await photo()], checklist: await answered(first.id, 'activate', null) }), params({}))
    expect(actRes.status).toBe(200)
    const { piece } = await actRes.json()
    expect(piece).toMatchObject({ serial: 1, state: 'CUT_PENDING_QA' })

    // Cutting QA passes and a blue label lands in the print queue.
    cookie.value = 'dev:qa'
    const qaRes = await qa.POST(post({ stage: 'cutting', result: 'pass', attachmentIds: [await photo()], expectedVersion: 1, checklist: await answered(piece.id, 'qa', 'cutting') }), params({ id: piece.id }))
    expect(qaRes.status).toBe(200)
    cookie.value = 'dev:store'
    const pq = await (await printQueue.GET(new Request('http://x?stage=cutting'), params({}))).json()
    expect(JSON.stringify(pq)).toContain(first.qrToken)
  })

  it('cancelled pieces are invisible to the floor: not counted as planned, never chosen by activate, scan shows no actions', async () => {
    const { lineItem } = await createLineItem({ orderId, styleId: bagId, size: 'ONE', shade: 'BLU-01', quantity: 5 }, 'o2f-2', seed.users.merchandiser.id)
    cookie.value = 'dev:store'
    // Cut serial 1 so the decrease has something it must not touch.
    const serial1 = await testPrisma.piece.findFirstOrThrow({ where: { lineItemId: lineItem.id, serial: 1 } })
    await activate.POST(post({ lineItemId: lineItem.id, leatherLot: 'L', attachmentIds: [await photo()], checklist: await answered(serial1.id, 'activate', null) }), params({}))

    await changeQuantity({ lineItemId: lineItem.id, input: { quantity: 2, reason: 'buyer trimmed' }, user: seed.users.admin, idempotencyKey: 'o2f-3' })

    const list = (await (await lineItems.GET(new Request('http://x'), params({}))).json()).lineItems as Array<{ id: string; planned: number; cut: number; quantity: number }>
    expect(list.find((l) => l.id === lineItem.id)).toMatchObject({ quantity: 2, planned: 1, cut: 1 })

    // Activate takes serial 2 (the only PLANNED one left), not a cancelled higher serial.
    const serial2 = await testPrisma.piece.findFirstOrThrow({ where: { lineItemId: lineItem.id, serial: 2 } })
    const actRes = await activate.POST(post({ lineItemId: lineItem.id, leatherLot: 'L', attachmentIds: [await photo()], checklist: await answered(serial2.id, 'activate', null) }), params({}))
    expect((await actRes.json()).piece.serial).toBe(2)

    // Nothing left: the bench gets a clear refusal, not a cancelled piece.
    const none = await activate.POST(post({ lineItemId: lineItem.id, leatherLot: 'L', attachmentIds: [await photo()], checklist: await answered(serial2.id, 'activate', null) }), params({}))
    expect(none.status).toBe(422)
    expect((await none.json()).error.code).toBe('no_planned_piece')

    // A cancelled token still scans (it is a real label) but offers no action.
    const cancelled = await testPrisma.piece.findFirstOrThrow({ where: { lineItemId: lineItem.id, state: 'CANCELLED' } })
    const scanRes = await scan.GET(new Request('http://x'), params({ token: cancelled.qrToken }))
    expect(scanRes.status).toBe(200)
    expect((await scanRes.json()).actions).toEqual([])
  })

  it('office writes never touch piece_events except through the write path: the log is append-only and consistent', async () => {
    const { lineItem } = await createLineItem({ orderId, styleId: bagId, size: 'ONE', shade: 'GRN-02', quantity: 3 }, 'o2f-4', seed.users.merchandiser.id)
    expect(await testPrisma.pieceEvent.count()).toBe(0)   // planned pieces have no events
    await changeQuantity({ lineItemId: lineItem.id, input: { quantity: 1, reason: 'x' }, user: seed.users.admin, idempotencyKey: 'o2f-5' })
    const events = await testPrisma.pieceEvent.findMany()
    expect(events).toHaveLength(2)
    expect(events.every((e) => e.eventType === 'PIECE_CANCELLED')).toBe(true)
    // Replaying the quantity change appends nothing.
    await changeQuantity({ lineItemId: lineItem.id, input: { quantity: 1, reason: 'x' }, user: seed.users.admin, idempotencyKey: 'o2f-5' })
    expect(await testPrisma.pieceEvent.count()).toBe(2)
  })
})
