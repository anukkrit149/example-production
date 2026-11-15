import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resetTestDb, testPrisma } from '@hf/db/test'
import { seedAll, type SeedResult } from '@hf/db'
import { runPieceAction } from '@hf/server'

const cookie = { value: 'dev:qa' }
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (n: string) => (n === 'hf_dev_user' && cookie.value ? { value: cookie.value } : undefined) }),
}))
const reject = await import('@/app/api/pieces/[id]/reject/route')

let seed: SeedResult
const photo = async () => (await testPrisma.attachment.create({ data: { storageKey: `t/${crypto.randomUUID()}.jpg`, mime: 'image/jpeg', bytes: 1, takenById: seed.users.qa.id } })).id
const post = (body: unknown) => new Request('http://x', { method: 'POST', body: JSON.stringify(body), headers: { 'idempotency-key': crypto.randomUUID() } })
const params = (p: Record<string, string>) => ({ params: Promise.resolve(p) })

async function cutOk(i: number) {
  const p = seed.pieces[i]!
  await runPieceAction({ pieceId: p.id, user: seed.users.store, idempotencyKey: `a${i}`, event: { type: 'PIECE_ACTIVATED', stage: 'cutting' }, attachmentIds: [await photo()] })
  await runPieceAction({ pieceId: p.id, user: seed.users.qa, idempotencyKey: `q${i}`, event: { type: 'STAGE_QA_PASSED', stage: 'cutting' }, attachmentIds: [await photo()] })
  return p
}

describe('reject', () => {
  beforeEach(async () => { await resetTestDb(); seed = await seedAll(testPrisma); process.env.DEV_AUTH = 'true'; cookie.value = 'dev:qa' })

  it('rejects a piece without a replacement and leaves the line item short', async () => {
    const p = await cutOk(0)
    const before = await testPrisma.piece.count({ where: { lineItemId: p.lineItemId } })
    const res = await reject.POST(post({ reason: 'leather_flaw', replace: false }), params({ id: p.id }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.piece.state).toBe('REJECTED')
    expect(body.replacement).toBeNull()
    expect(await testPrisma.piece.count({ where: { lineItemId: p.lineItemId } })).toBe(before)
    expect(await testPrisma.pieceLineage.count()).toBe(0)
  })

  it('rejects with a replacement, creating one planned piece and a lineage link', async () => {
    const p = await cutOk(1)
    const before = await testPrisma.piece.count({ where: { lineItemId: p.lineItemId } })
    const res = await reject.POST(post({ reason: 'cut_defect', note: 'panel short at hem', replace: true }), params({ id: p.id }))
    const body = await res.json()
    expect(body.piece.state).toBe('REJECTED')
    expect(body.replacement.qrToken).toMatch(/^HF-P-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/)
    expect(body.replacement.qrToken).not.toBe(p.qrToken)
    const fresh = await testPrisma.piece.findUniqueOrThrow({ where: { id: body.replacement.id } })
    expect(fresh.state).toBe('PLANNED')
    expect(fresh.lineItemId).toBe(p.lineItemId)
    expect(await testPrisma.piece.count({ where: { lineItemId: p.lineItemId } })).toBe(before + 1)
    const link = await testPrisma.pieceLineage.findFirstOrThrow({ where: { rejectedPieceId: p.id } })
    expect(link.replacementPieceId).toBe(body.replacement.id)
    expect(link.reason).toBe('cut_defect')
  })

  it('records the reason and note on the event', async () => {
    const p = await cutOk(2)
    await reject.POST(post({ reason: 'other', note: 'buyer withdrew the size', replace: false }), params({ id: p.id }))
    const ev = await testPrisma.pieceEvent.findFirstOrThrow({ where: { pieceId: p.id, eventType: 'PIECE_REJECTED' } })
    expect(ev.details).toMatchObject({ reason: 'other', note: 'buyer withdrew the size', replace: false })
  })

  it('refuses a store operator', async () => {
    const p = await cutOk(3)
    cookie.value = 'dev:store'
    const res = await reject.POST(post({ reason: 'damaged', replace: false }), params({ id: p.id }))
    expect(res.status).toBe(403)
    expect((await testPrisma.piece.findUniqueOrThrow({ where: { id: p.id } })).state).toBe('CUT_OK')
  })

  it('allows a supervisor', async () => {
    const p = await cutOk(4)
    cookie.value = 'dev:supervisor'
    const res = await reject.POST(post({ reason: 'damaged', replace: false }), params({ id: p.id }))
    expect(res.status).toBe(200)
  })

  it('requires a note when the reason is other', async () => {
    const p = await cutOk(5)
    const res = await reject.POST(post({ reason: 'other', replace: false }), params({ id: p.id }))
    expect(res.status).toBe(400)
  })

  it('refuses to reject a piece already with a worker', async () => {
    const p = await cutOk(6)
    const paster = seed.workers.find((w) => w.type === 'paster')!
    await runPieceAction({ pieceId: p.id, user: seed.users.store, idempotencyKey: `i${p.id}`, event: { type: 'ISSUED', stage: 'pasting' }, workerId: paster.id, afterWorker: paster.id, attachmentIds: [await photo()] })
    const res = await reject.POST(post({ reason: 'damaged', replace: false }), params({ id: p.id }))
    expect(res.status).toBe(422)
  })

  it('does not create a second replacement on an idempotent replay', async () => {
    const p = await cutOk(7)
    const key = crypto.randomUUID()
    const req = () => new Request('http://x', { method: 'POST', body: JSON.stringify({ reason: 'cut_defect', replace: true }), headers: { 'idempotency-key': key } })
    const a = await (await reject.POST(req(), params({ id: p.id }))).json()
    const b = await (await reject.POST(req(), params({ id: p.id }))).json()
    expect(b.replayed).toBe(true)
    expect(b.replacement.id).toBe(a.replacement.id)
    expect(await testPrisma.pieceLineage.count({ where: { rejectedPieceId: p.id } })).toBe(1)
  })
})
