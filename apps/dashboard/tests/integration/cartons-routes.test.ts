import { beforeEach, describe, expect, it, vi } from 'vitest'
import { testPrisma } from '@hf/db/test'
import type { SeedResult } from '@hf/db'
import { resolveChecklistVersion } from '@hf/server'
import { as, freshSeed, nextHeadersMock, authServerMock, packPiece, params, post, read } from './helpers'

vi.mock('next/headers', () => nextHeadersMock())
vi.mock('@/lib/auth-server', () => authServerMock())

const ship = await import('@/app/api/cartons/[carton]/ship/route')
const resolve = await import('@/app/api/checklists/resolve/route')

let seed: SeedResult

describe('dashboard carton routes', () => {
  beforeEach(async () => { seed = await freshSeed() })

  it('merchandiser ships a carton of two packed pieces; management is 403; an unknown carton is 422', async () => {
    await packPiece(seed, 0, 'CTN-01'); await packPiece(seed, 1, 'CTN-01')
    const order = await testPrisma.order.findFirstOrThrow()
    const resolved = (await resolveChecklistVersion({ step: 'ship', stage: null, category: 'jacket', programId: order.programId }))!
    const photoId = (await testPrisma.attachment.create({ data: { storageKey: `t/${crypto.randomUUID()}.jpg`, mime: 'image/jpeg', bytes: 1, takenById: seed.users.merchandiser.id } })).id
    const body = { orderId: order.id, attachmentIds: [photoId], checklist: { versionId: resolved.id, answers: resolved.items.map((i) => ({ itemId: i.id, value: true })) } }
    as(seed.users.management)
    expect((await ship.POST(post(body), params({ carton: 'CTN-01' }))).status).toBe(403)
    as(seed.users.merchandiser)
    const res = await ship.POST(post(body), params({ carton: 'CTN-01' }))
    expect(res.status).toBe(200)
    expect(await read(res)).toMatchObject({ shipped: 2, replayed: false })
    expect(await testPrisma.piece.count({ where: { state: 'SHIPPED' } })).toBe(2)
    const missing = await ship.POST(post({ ...body, attachmentIds: [] }), params({ carton: 'CTN-99' }))
    expect(missing.status).toBe(422)
    expect((await read<{ error: { code: string } }>(missing)).error.code).toBe('carton_empty')
  })

  it('replaying the same idempotency key ships nothing twice', async () => {
    await packPiece(seed, 0, 'CTN-02'); await packPiece(seed, 1, 'CTN-02')
    const order = await testPrisma.order.findFirstOrThrow()
    const resolved = (await resolveChecklistVersion({ step: 'ship', stage: null, category: 'jacket', programId: order.programId }))!
    const photoId = (await testPrisma.attachment.create({ data: { storageKey: `t/${crypto.randomUUID()}.jpg`, mime: 'image/jpeg', bytes: 1, takenById: seed.users.merchandiser.id } })).id
    const body = { orderId: order.id, attachmentIds: [photoId], checklist: { versionId: resolved.id, answers: resolved.items.map((i) => ({ itemId: i.id, value: true })) } }
    as(seed.users.merchandiser)
    const key = 'ship-retry-key-0001'
    const first = await ship.POST(post(body, key), params({ carton: 'CTN-02' }))
    expect(first.status).toBe(200)
    expect(await read(first)).toMatchObject({ shipped: 2, replayed: false })
    const second = await ship.POST(post(body, key), params({ carton: 'CTN-02' }))
    expect(second.status).toBe(200)
    expect(await read(second)).toMatchObject({ shipped: 0, replayed: true })
    expect(await testPrisma.pieceEvent.count({ where: { eventType: 'SHIPPED' } })).toBe(2)
  })

  it('resolves the ship checklist for a signed-in user, by carton category when given, else the order\'s first line item', async () => {
    await packPiece(seed, 0, 'CTN-01')
    const order = await testPrisma.order.findFirstOrThrow()
    as(seed.users.store)

    const byCarton = await resolve.GET(new Request(`http://x/api/checklists/resolve?orderId=${order.id}&carton=CTN-01`), params())
    expect(byCarton.status).toBe(200)
    const byCartonBody = await read<{ checklist: { step: string; category: string } | null }>(byCarton)
    expect(byCartonBody.checklist).toMatchObject({ step: 'ship', category: 'jacket' })

    const noCarton = await resolve.GET(new Request(`http://x/api/checklists/resolve?orderId=${order.id}`), params())
    expect(noCarton.status).toBe(200)
    const noCartonBody = await read<{ checklist: { step: string; category: string } | null }>(noCarton)
    expect(noCartonBody.checklist).toMatchObject({ step: 'ship', category: 'jacket' })
  })
})
