import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resetTestDb, testPrisma } from '@hf/db/test'
import { seedAll, type SeedResult } from '@hf/db'
import { runPieceAction } from '@hf/server'

const cookie = { value: 'dev:store' }
vi.mock('next/headers', () => ({ cookies: async () => ({ get: (n: string) => (n === 'hf_dev_user' && cookie.value ? { value: cookie.value } : undefined) }) }))

const checklists = await import('@/app/api/checklists/route')
const pack = await import('@/app/api/pieces/[id]/pack/route')
const shipRoute = await import('@/app/api/cartons/[carton]/ship/route')
const cartons = await import('@/app/api/cartons/route')

let seed: SeedResult
const photo = async () => (await testPrisma.attachment.create({ data: { storageKey: `t/${crypto.randomUUID()}.jpg`, mime: 'image/jpeg', bytes: 1, takenById: seed.users.store.id } })).id
const post = (body: unknown, key = crypto.randomUUID()) => new Request('http://x', { method: 'POST', body: JSON.stringify(body), headers: { 'idempotency-key': key } })
const params = (p: Record<string, string>) => ({ params: Promise.resolve(p) })

/** Fetch the resolved checklist for a piece and answer every item true (materials get one line). */
async function answered(pieceId: string, step: string, stage: string | null) {
  const res = await checklists.GET(new Request(`http://x/api/checklists?pieceId=${pieceId}&step=${step}${stage ? `&stage=${stage}` : ''}`), params({}))
  const { checklist } = await res.json()
  return { versionId: checklist.id, answers: checklist.items.map((i: { id: string; kind: string }) => ({ itemId: i.id, value: true, ...(i.kind === 'materials' ? { materials: [{ code: 'ZIP-01', qty: 1, unit: 'pc' }] } : {}) })) }
}

/** Walk a seeded piece to QC_OK (copied from Task 6's dashboard cartons test, without the pack). */
async function qcOk(i: number) {
  const p = seed.pieces[i]!
  const w = seed.workers[1]!
  const k = (s: string) => `${s}-${i}`
  await runPieceAction({ pieceId: p.id, user: seed.users.store, idempotencyKey: k('act'), event: { type: 'PIECE_ACTIVATED', stage: 'cutting' }, attachmentIds: [await photo()] })
  await runPieceAction({ pieceId: p.id, user: seed.users.qa, idempotencyKey: k('qa-cut'), event: { type: 'STAGE_QA_PASSED', stage: 'cutting' }, attachmentIds: [await photo()] })
  for (const stage of ['pasting', 'stitching', 'finishing'] as const) {
    await runPieceAction({ pieceId: p.id, user: seed.users.store, idempotencyKey: k(`iss-${stage}`), event: { type: 'ISSUED', stage }, workerId: w.id, afterWorker: w.id, attachmentIds: [await photo()] })
    await runPieceAction({ pieceId: p.id, user: seed.users.store, idempotencyKey: k(`rec-${stage}`), event: { type: 'RECEIVED', stage }, workerId: w.id, afterWorker: null, attachmentIds: [await photo()] })
    await runPieceAction({ pieceId: p.id, user: seed.users.qa, idempotencyKey: k(`qa-${stage}`), event: { type: 'STAGE_QA_PASSED', stage }, attachmentIds: [await photo()] })
  }
  await runPieceAction({ pieceId: p.id, user: seed.users.qa, idempotencyKey: k('qc'), event: { type: 'STAGE_QA_PASSED', stage: 'qc' }, attachmentIds: [await photo()] })
  return p
}

describe('pack, ship, cartons', () => {
  beforeEach(async () => { await resetTestDb(); seed = await seedAll(testPrisma); process.env.DEV_AUTH = 'true'; cookie.value = 'dev:store' })

  it('pack needs the checklist and a carton; ship carton ships all packed pieces; cartons list reads back', async () => {
    const p0 = await qcOk(0); const p1 = await qcOk(1)
    for (const p of [p0, p1]) {
      const res = await pack.POST(post({ carton: 'ctn-01', attachmentIds: [await photo()], checklist: await answered(p.id, 'pack', null) }), params({ id: p.id }))
      expect(res.status).toBe(200)
      expect((await res.json()).piece.state).toBe('PACKED')
    }
    const order = await testPrisma.order.findFirstOrThrow()
    const list = await cartons.GET(new Request(`http://x/api/cartons?orderId=${order.id}`), params({}))
    expect((await list.json()).cartons).toEqual([expect.objectContaining({ carton: 'CTN-01', packed: 2, shipped: 0 })])
    const ship = await shipRoute.POST(post({ orderId: order.id, attachmentIds: [await photo()], checklist: await answered(p0.id, 'ship', null) }, 'ship-key'), params({ carton: 'CTN-01' }))
    expect(ship.status).toBe(200)
    expect((await ship.json())).toMatchObject({ shipped: 2, replayed: false })
    const again = await shipRoute.POST(post({ orderId: order.id, attachmentIds: [], checklist: await answered(p0.id, 'ship', null) }, 'ship-key'), params({ carton: 'CTN-01' }))
    expect((await again.json())).toMatchObject({ shipped: 0, replayed: true })
  })

  it('pack on a piece that is not QC_OK is 422 invalid_transition', async () => {
    const p = seed.pieces[0]!
    const res = await pack.POST(post({ carton: 'CTN-02', attachmentIds: [await photo()], checklist: await answered(p.id, 'pack', null) }), params({ id: p.id }))
    expect(res.status).toBe(422)
    expect((await res.json()).error.code).toBe('invalid_transition')
  })
})
