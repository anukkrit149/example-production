import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resetTestDb, testPrisma } from '@hf/db/test'
import { seedAll, type SeedResult } from '@hf/db'

// One mutable identity the tests swap between roles. `requireUser` reads it
// through `cookies()`, so mocking next/headers is the whole auth seam.
const cookie = { value: 'dev:store' }
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (n: string) => (n === 'hf_dev_user' && cookie.value ? { value: cookie.value } : undefined) }),
}))

const scan = await import('@/app/api/scan/[token]/route')
const checklists = await import('@/app/api/checklists/route')
const activate = await import('@/app/api/pieces/activate/route')
const qa = await import('@/app/api/pieces/[id]/qa/route')
const issue = await import('@/app/api/pieces/[id]/issue/route')
const receive = await import('@/app/api/pieces/[id]/receive/route')
const hold = await import('@/app/api/pieces/[id]/hold/route')
const release = await import('@/app/api/pieces/[id]/release/route')
const reprint = await import('@/app/api/pieces/[id]/reprint/route')

let seed: SeedResult

const photo = async () =>
  (await testPrisma.attachment.create({
    data: { storageKey: `t/${crypto.randomUUID()}.jpg`, mime: 'image/jpeg', bytes: 1, takenById: seed.users.store.id },
  })).id

const post = (body: unknown, key = crypto.randomUUID()) =>
  new Request('http://x', { method: 'POST', body: JSON.stringify(body), headers: { 'idempotency-key': key } })

const params = (p: Record<string, string>) => ({ params: Promise.resolve(p) })

/** Fetch the resolved checklist for a piece and answer every item true (materials get one line). */
async function answered(pieceId: string, step: string, stage: string | null) {
  const res = await checklists.GET(new Request(`http://x/api/checklists?pieceId=${pieceId}&step=${step}${stage ? `&stage=${stage}` : ''}`), params({}))
  const { checklist } = await res.json()
  return { versionId: checklist.id, answers: checklist.items.map((i: { id: string; kind: string }) => ({ itemId: i.id, value: true, ...(i.kind === 'materials' ? { materials: [{ code: 'ZIP-01', qty: 1, unit: 'pc' }] } : {}) })) }
}

describe('piece routes', () => {
  beforeEach(async () => {
    await resetTestDb()
    seed = await seedAll(testPrisma)
    process.env.DEV_AUTH = 'true'
    cookie.value = 'dev:store'
  })

  it('scan resolves a seeded token, lowercased, with next actions', async () => {
    const res = await scan.GET(new Request('http://x'), params({ token: seed.pieces[0]!.qrToken.toLowerCase() }))
    expect(res.status).toBe(200)
    const v = await res.json()
    expect(v.state).toBe('PLANNED')
    expect(v.actions).toEqual(['activate', 'cancel'])
    expect(v.styleCode).toBe('LJ-204')
    expect(v.orderNumber).toBe('PO-4471')
    expect(v.programName).toBe('Autumn 26')
    expect(v.buyerName).toBe('Nordheim GmbH')
    expect(v.worker).toBeNull()
    expect(v.lastEvent).toBeNull()
    expect(v.labelStage).toBeNull()
    expect(v.version).toBe(0)
    expect(typeof v.ageMinutes).toBe('number')
  })

  it('scan of an unknown token is a 404', async () => {
    const res = await scan.GET(new Request('http://x'), params({ token: 'HF-P-ZZZZZZZZ' }))
    expect(res.status).toBe(404)
    expect((await res.json()).error.code).toBe('unknown_token')
  })

  it('scan of a malformed token is a 404 rather than a crash', async () => {
    const res = await scan.GET(new Request('http://x'), params({ token: 'not-a-token' }))
    expect(res.status).toBe(404)
  })

  it('activate picks the lowest-serial planned piece on the line item', async () => {
    const li = seed.lineItems[0]!
    const p1 = seed.pieces.find((p) => p.lineItemId === li.id && p.serial === 1)!
    const res = await activate.POST(
      post({ lineItemId: li.id, leatherLot: 'LOT-22', attachmentIds: [await photo()], checklist: await answered(p1.id, 'activate', null) }),
      params({}),
    )
    expect(res.status).toBe(200)
    const { piece, replayed } = await res.json()
    expect(piece.serial).toBe(1)
    expect(piece.state).toBe('CUT_PENDING_QA')
    expect(piece.actions).toEqual(['submit_qa', 'reject'])
    expect(piece.lastEvent.type).toBe('PIECE_ACTIVATED')
    expect(piece.lastEvent.by).toBe('Store Operator')
    expect(replayed).toBe(false)

    // The second activate on the same line item takes serial 2, not 1 again.
    const p2 = seed.pieces.find((p) => p.lineItemId === li.id && p.serial === 2)!
    const res2 = await activate.POST(
      post({ lineItemId: li.id, leatherLot: 'LOT-22', attachmentIds: [await photo()], checklist: await answered(p2.id, 'activate', null) }),
      params({}),
    )
    expect((await res2.json()).piece.serial).toBe(2)
  })

  it('activate honours an explicit serial and 422s when none is planned', async () => {
    const li = seed.lineItems[0]!
    const p7 = seed.pieces.find((p) => p.lineItemId === li.id && p.serial === 7)!
    const r = await activate.POST(
      post({ lineItemId: li.id, serial: 7, leatherLot: 'L', attachmentIds: [await photo()], checklist: await answered(p7.id, 'activate', null) }),
      params({}),
    )
    expect((await r.json()).piece.serial).toBe(7)

    const again = await activate.POST(
      post({ lineItemId: li.id, serial: 7, leatherLot: 'L', attachmentIds: [await photo()], checklist: await answered(p7.id, 'activate', null) }),
      params({}),
    )
    expect(again.status).toBe(422)
    expect((await again.json()).error.code).toBe('no_planned_piece')
  })

  it('missing Idempotency-Key is a 400', async () => {
    const res = await activate.POST(new Request('http://x', { method: 'POST', body: '{}' }), params({}))
    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe('idempotency_key')
  })

  it('a repeated Idempotency-Key replays instead of acting twice', async () => {
    const li = seed.lineItems[0]!
    const p1 = seed.pieces.find((p) => p.lineItemId === li.id && p.serial === 1)!
    const body = { lineItemId: li.id, leatherLot: 'LOT-1', attachmentIds: [await photo()], checklist: await answered(p1.id, 'activate', null) }
    const key = crypto.randomUUID()
    const a = await (await activate.POST(post(body, key), params({}))).json()
    const b = await (await activate.POST(post(body, key), params({}))).json()
    expect(a.replayed).toBe(false)
    expect(b.replayed).toBe(true)
    expect(b.piece.id).toBe(a.piece.id)
    expect(await testPrisma.pieceEvent.count({ where: { pieceId: a.piece.id } })).toBe(1)
  })

  it('a qa user may not activate', async () => {
    cookie.value = 'dev:qa'
    const li = seed.lineItems[0]!
    const p1 = seed.pieces.find((p) => p.lineItemId === li.id && p.serial === 1)!
    cookie.value = 'dev:store'
    const checklist = await answered(p1.id, 'activate', null)
    cookie.value = 'dev:qa'
    const res = await activate.POST(
      post({ lineItemId: li.id, leatherLot: 'L', attachmentIds: [await photo()], checklist }),
      params({}),
    )
    expect(res.status).toBe(403)
  })

  it('walks activate, QA pass, issue, receive, hold, release', async () => {
    const li = seed.lineItems[2]! // the bag
    const p1 = seed.pieces.find((p) => p.lineItemId === li.id && p.serial === 1)!
    let r = await (await activate.POST(
      post({ lineItemId: li.id, leatherLot: 'LOT-9', attachmentIds: [await photo()], checklist: await answered(p1.id, 'activate', null) }),
      params({}),
    )).json()
    const id = r.piece.id

    cookie.value = 'dev:qa'
    r = await (await qa.POST(
      post({ stage: 'cutting', result: 'pass', expectedVersion: 1, attachmentIds: [await photo()], checklist: await answered(id, 'qa', 'cutting') }),
      params({ id }),
    )).json()
    expect(r.piece.state).toBe('CUT_OK')
    expect(r.piece.labelStage).toBe('cutting')
    expect(r.piece.actions).toEqual(['issue', 'reprint', 'hold', 'reject'])

    cookie.value = 'dev:store'
    const paster = seed.workers.find((w) => w.type === 'paster')!
    r = await (await issue.POST(
      post({ stage: 'pasting', workerId: paster.id, expectedVersion: 2, attachmentIds: [await photo()], checklist: await answered(id, 'issue', 'pasting') }),
      params({ id }),
    )).json()
    expect(r.piece.state).toBe('WITH_PASTING')
    expect(r.piece.worker.name).toBe(paster.name)

    const wrong = await receive.POST(
      post({ stage: 'pasting', workerId: seed.workers[0]!.id, attachmentIds: [await photo()], checklist: await answered(id, 'receive', 'pasting') }),
      params({ id }),
    )
    expect(wrong.status).toBe(422)
    expect((await wrong.json()).error.code).toBe('wrong_worker')

    r = await (await receive.POST(
      post({ stage: 'pasting', workerId: paster.id, attachmentIds: [await photo()], checklist: await answered(id, 'receive', 'pasting') }),
      params({ id }),
    )).json()
    expect(r.piece.state).toBe('PASTED_PENDING_QA')
    expect(r.piece.worker).toBeNull()

    r = await (await hold.POST(post({ reason: 'shade mismatch', attachmentIds: [await photo()] }), params({ id }))).json()
    expect(r.piece.state).toBe('ON_HOLD')
    expect(r.piece.actions).toEqual(['release'])

    const denied = await release.POST(post({ reason: 'checked', attachmentIds: [await photo()] }), params({ id }))
    expect(denied.status).toBe(403)

    cookie.value = 'dev:supervisor'
    r = await (await release.POST(post({ reason: 'checked', attachmentIds: [await photo()] }), params({ id }))).json()
    expect(r.piece.state).toBe('PASTED_PENDING_QA')
  })

  it('QA fail keeps state and records defects', async () => {
    const li = seed.lineItems[1]!
    const p1 = seed.pieces.find((p) => p.lineItemId === li.id && p.serial === 1)!
    const r0 = await (await activate.POST(
      post({ lineItemId: li.id, leatherLot: 'L', attachmentIds: [await photo()], checklist: await answered(p1.id, 'activate', null) }),
      params({}),
    )).json()

    cookie.value = 'dev:qa'
    const r = await (await qa.POST(
      post({ stage: 'cutting', result: 'fail', defectCodes: ['MISSING_PANEL'], attachmentIds: [await photo()] }),
      params({ id: r0.piece.id }),
    )).json()
    expect(r.piece.state).toBe('CUT_PENDING_QA')

    const ev = await testPrisma.pieceEvent.findFirst({ where: { pieceId: r0.piece.id, eventType: 'STAGE_QA_FAILED' } })
    expect((ev!.details as { defectCodes: string[] }).defectCodes).toEqual(['MISSING_PANEL'])
  })

  it('a hold needs a photo; with one it takes the piece off the floor', async () => {
    const li = seed.lineItems[1]!
    const p1 = seed.pieces.find((p) => p.lineItemId === li.id && p.serial === 1)!
    const r0 = await (await activate.POST(
      post({ lineItemId: li.id, leatherLot: 'L', attachmentIds: [await photo()], checklist: await answered(p1.id, 'activate', null) }),
      params({}),
    )).json()
    const id = r0.piece.id
    cookie.value = 'dev:qa'
    await qa.POST(post({ stage: 'cutting', result: 'pass', attachmentIds: [await photo()], checklist: await answered(id, 'qa', 'cutting') }), params({ id }))
    cookie.value = 'dev:store'

    const bare = await hold.POST(post({ reason: 'waiting for lining', expectedVersion: 2 }), params({ id }))
    expect(bare.status).toBe(422)
    expect((await bare.json()).error.code).toBe('photo_required')

    const ok = await hold.POST(post({ reason: 'waiting for lining', expectedVersion: 2, attachmentIds: [await photo()] }), params({ id }))
    expect(ok.status).toBe(200)
    expect((await ok.json()).piece.state).toBe('ON_HOLD')
  })

  it('a QA fail may carry the checklist; the out-of-range value is kept, not enforced', async () => {
    const li = seed.lineItems[0]!
    const p1 = seed.pieces.find((p) => p.lineItemId === li.id && p.serial === 1)!
    const r0 = await (await activate.POST(
      post({ lineItemId: li.id, leatherLot: 'L', attachmentIds: [await photo()], checklist: await answered(p1.id, 'activate', null) }),
      params({}),
    )).json()
    const id = r0.piece.id

    const list = await testPrisma.checklist.findFirstOrThrow({ where: { scopeKey: 'qa|cutting|jacket|' } })
    const v = await testPrisma.checklistVersion.findFirstOrThrow({ where: { checklistId: list.id, publishedAt: { not: null } } })
    const item = await testPrisma.checklistItem.create({ data: { versionId: v.id, position: 99, kind: 'measure', textEn: 'Panel width', textHi: 'पैनल की चौड़ाई', pictogram: 'measure', unit: 'cm', min: 10, max: 12 } })

    cookie.value = 'dev:qa'
    const a = await answered(id, 'qa', 'cutting')
    const outOfRange = { ...a, answers: a.answers.map((x: { itemId: string }) => (x.itemId === item.id ? { itemId: item.id, value: 20 } : x)) }
    const res = await qa.POST(
      post({ stage: 'cutting', result: 'fail', defectCodes: ['CUT_SHORT'], attachmentIds: [await photo()], checklist: outOfRange }),
      params({ id }),
    )
    expect(res.status).toBe(200)
    expect((await res.json()).piece.state).toBe('CUT_PENDING_QA')

    const ev = await testPrisma.pieceEvent.findFirstOrThrow({ where: { pieceId: id, eventType: 'STAGE_QA_FAILED' } })
    const details = ev.details as { checklist: { answers: Array<{ itemId: string; value: number }> } }
    expect(details.checklist.answers.find((x) => x.itemId === item.id)).toMatchObject({ value: 20 })
  })

  it('a QA pass with no checklist is rejected by the contract', async () => {
    const li = seed.lineItems[1]!
    const p1 = seed.pieces.find((p) => p.lineItemId === li.id && p.serial === 1)!
    const r0 = await (await activate.POST(
      post({ lineItemId: li.id, leatherLot: 'L', attachmentIds: [await photo()], checklist: await answered(p1.id, 'activate', null) }),
      params({}),
    )).json()
    cookie.value = 'dev:qa'
    const res = await qa.POST(
      post({ stage: 'cutting', result: 'pass', attachmentIds: [await photo()] }),
      params({ id: r0.piece.id }),
    )
    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe('validation')
  })

  it('reprint queues a fresh label with a reason, and 422s when there is no label', async () => {
    const li = seed.lineItems[1]!
    const p1 = seed.pieces.find((p) => p.lineItemId === li.id && p.serial === 1)!
    const r0 = await (await activate.POST(
      post({ lineItemId: li.id, leatherLot: 'L', attachmentIds: [await photo()], checklist: await answered(p1.id, 'activate', null) }),
      params({}),
    )).json()
    const id = r0.piece.id

    // CUT_PENDING_QA has no label yet.
    const none = await reprint.POST(post({ reason: 'damaged' }), params({ id }))
    expect(none.status).toBe(422)
    expect((await none.json()).error.code).toBe('no_label')

    cookie.value = 'dev:qa'
    await qa.POST(
      post({ stage: 'cutting', result: 'pass', attachmentIds: [await photo()], checklist: await answered(id, 'qa', 'cutting') }),
      params({ id }),
    )
    cookie.value = 'dev:store'
    const r = await reprint.POST(post({ reason: 'unreadable' }), params({ id }))
    expect(r.status).toBe(200)
    const { piece } = await r.json()
    expect(piece.state).toBe('CUT_OK') // a reprint never moves the piece

    const labels = await testPrisma.labelPrint.findMany({ where: { pieceId: id, kind: 'stage' }, orderBy: { requestedAt: 'asc' } })
    expect(labels).toHaveLength(2) // the QA-pass label plus the reprint
    expect(labels[1]).toMatchObject({ stage: 'cutting', template: 't50x25', reprintReason: 'unreadable' })
  })

  it('release without a prior hold is a 422', async () => {
    const li = seed.lineItems[1]!
    const p1 = seed.pieces.find((p) => p.lineItemId === li.id && p.serial === 1)!
    const r0 = await (await activate.POST(
      post({ lineItemId: li.id, leatherLot: 'L', attachmentIds: [await photo()], checklist: await answered(p1.id, 'activate', null) }),
      params({}),
    )).json()
    cookie.value = 'dev:supervisor'
    const res = await release.POST(post({ reason: 'nothing to release' }), params({ id: r0.piece.id }))
    expect(res.status).toBe(422)
    expect((await res.json()).error.code).toBe('not_held')
  })

  it('release returns the piece to the state it was held from, not a fixed one', async () => {
    const li = seed.lineItems[2]!
    const p1 = seed.pieces.find((p) => p.lineItemId === li.id && p.serial === 1)!
    const r0 = await (await activate.POST(
      post({ lineItemId: li.id, leatherLot: 'L', attachmentIds: [await photo()], checklist: await answered(p1.id, 'activate', null) }),
      params({}),
    )).json()
    const id = r0.piece.id

    cookie.value = 'dev:qa'
    await qa.POST(
      post({ stage: 'cutting', result: 'pass', attachmentIds: [await photo()], checklist: await answered(id, 'qa', 'cutting') }),
      params({ id }),
    )
    cookie.value = 'dev:supervisor'
    await hold.POST(post({ reason: 'audit', attachmentIds: [await photo()] }), params({ id }))
    const r = await (await release.POST(post({ reason: 'cleared', attachmentIds: [await photo()] }), params({ id }))).json()
    expect(r.piece.state).toBe('CUT_OK') // held from CUT_OK, so back to CUT_OK

    const held = await testPrisma.pieceEvent.findFirst({ where: { pieceId: id, eventType: 'PIECE_HELD' } })
    expect((held!.details as { heldFrom: string }).heldFrom).toBe('CUT_OK')
    const rel = await testPrisma.pieceEvent.findFirst({ where: { pieceId: id, eventType: 'PIECE_RELEASED' } })
    expect((rel!.details as { returnTo: string }).returnTo).toBe('CUT_OK')
  })

  it('a stale expectedVersion is a 409', async () => {
    const li = seed.lineItems[1]!
    const p1 = seed.pieces.find((p) => p.lineItemId === li.id && p.serial === 1)!
    const r0 = await (await activate.POST(
      post({ lineItemId: li.id, leatherLot: 'L', attachmentIds: [await photo()], checklist: await answered(p1.id, 'activate', null) }),
      params({}),
    )).json()
    cookie.value = 'dev:qa'
    const res = await qa.POST(
      post({ stage: 'cutting', result: 'pass', expectedVersion: 0, attachmentIds: [await photo()], checklist: await answered(r0.piece.id, 'qa', 'cutting') }),
      params({ id: r0.piece.id }),
    )
    expect(res.status).toBe(409)
    expect((await res.json()).error.code).toBe('version_conflict')
  })

  it('acting on an unknown piece id is a 404', async () => {
    const res = await hold.POST(post({ reason: 'x' }), params({ id: crypto.randomUUID() }))
    expect(res.status).toBe(404)
  })
})
