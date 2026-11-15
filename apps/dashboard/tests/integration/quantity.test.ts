import { beforeEach, describe, expect, it, vi } from 'vitest'
import { testPrisma } from '@hf/db/test'
import type { SeedResult } from '@hf/db'
import { runPieceAction } from '@hf/server'
import { as, freshSeed, nextHeadersMock, authServerMock, params, post, read } from './helpers'

vi.mock('next/headers', () => nextHeadersMock())
vi.mock('@/lib/auth-server', () => authServerMock())

const route = await import('@/app/api/line-items/[id]/quantity/route')

let seed: SeedResult
type Result = { lineItem: { quantity: number }; added: number; cancelled: number; replayed: boolean }

/** The seeded LJ-204 M line: 20 planned pieces, serials 1..20. */
const li = () => seed.lineItems[0]!
const states = async () =>
  (await testPrisma.piece.findMany({ where: { lineItemId: li().id }, orderBy: { serial: 'asc' } })).map((p) => `${p.serial}:${p.state}`)

async function activate(n: number) {
  const pieces = await testPrisma.piece.findMany({ where: { lineItemId: li().id }, orderBy: { serial: 'asc' }, take: n })
  for (const p of pieces)
    await runPieceAction({
      pieceId: p.id, user: seed.users.admin, idempotencyKey: `act-${p.id}`,
      event: { type: 'PIECE_ACTIVATED', stage: 'cutting' }, details: { leatherLot: 'L1', photoOverrideReason: 'test' },
    })
}

describe('quantity change', () => {
  beforeEach(async () => { seed = await freshSeed(); as(seed.users.merchandiser) })

  it('increase appends pieces with continuing serials', async () => {
    const res = await route.POST(post({ quantity: 23 }), params({ id: li().id }))
    expect(res.status).toBe(200)
    expect(await read<Result>(res)).toMatchObject({ added: 3, cancelled: 0, replayed: false, lineItem: { quantity: 23 } })
    const s = await states()
    expect(s).toHaveLength(23)
    expect(s.slice(-3)).toEqual(['21:PLANNED', '22:PLANNED', '23:PLANNED'])
  })

  it('decrease cancels the highest-serial PLANNED pieces through the piece write path, with the reason on the event', async () => {
    await activate(2)   // serials 1 and 2 are cut
    const res = await route.POST(post({ quantity: 17, reason: 'buyer reduced the order' }), params({ id: li().id }))
    expect(res.status).toBe(200)
    expect(await read<Result>(res)).toMatchObject({ added: 0, cancelled: 3, lineItem: { quantity: 17 } })
    const s = await states()
    expect(s.slice(0, 2)).toEqual(['1:CUT_PENDING_QA', '2:CUT_PENDING_QA'])
    expect(s.slice(-3)).toEqual(['18:CANCELLED', '19:CANCELLED', '20:CANCELLED'])
    expect(s.filter((x) => x.endsWith('PLANNED'))).toHaveLength(15)
    const events = await testPrisma.pieceEvent.findMany({ where: { eventType: 'PIECE_CANCELLED' } })
    expect(events).toHaveLength(3)
    expect(events[0]!.details).toMatchObject({ reason: 'buyer reduced the order', quantityFrom: 20, quantityTo: 17 })
    expect(events.every((e) => e.userId === seed.users.merchandiser.id)).toBe(true)
  })

  it('cannot go below the number already cut', async () => {
    await activate(5)
    const res = await route.POST(post({ quantity: 4, reason: 'too far' }), params({ id: li().id }))
    expect(res.status).toBe(422)
    expect((await read(res)).error).toEqual({ code: 'below_activated', message: '5 pieces are already cut; quantity cannot go below 5' })
    expect((await states()).filter((x) => x.endsWith('CANCELLED'))).toHaveLength(0)
  })

  it('a decrease needs a reason', async () => {
    const res = await route.POST(post({ quantity: 10 }), params({ id: li().id }))
    expect(res.status).toBe(422)
    expect((await read(res)).error).toMatchObject({ code: 'reason_required' })
    expect(await testPrisma.pieceEvent.count()).toBe(0)
  })

  it('quantity zero cancels every planned piece and keeps the line item', async () => {
    const res = await route.POST(post({ quantity: 0, reason: 'order dropped' }), params({ id: li().id }))
    expect(res.status).toBe(200)
    expect(await read<Result>(res)).toMatchObject({ cancelled: 20, lineItem: { quantity: 0 } })
    expect(await testPrisma.orderLineItem.count({ where: { id: li().id } })).toBe(1)
  })

  it('same quantity is a no-op', async () => {
    const res = await route.POST(post({ quantity: 20 }), params({ id: li().id }))
    expect(res.status).toBe(200)
    expect(await read<Result>(res)).toMatchObject({ added: 0, cancelled: 0 })
  })

  it('replays the key', async () => {
    const key = 'qty-key-000001'
    await route.POST(post({ quantity: 22 }, key), params({ id: li().id }))
    const res = await route.POST(post({ quantity: 22 }, key), params({ id: li().id }))
    expect(await read<Result>(res)).toMatchObject({ replayed: true, lineItem: { quantity: 22 } })
    expect(await states()).toHaveLength(22)
  })

  it('management is 403; unknown line item is 404', async () => {
    as(seed.users.management)
    expect((await route.POST(post({ quantity: 21 }), params({ id: li().id }))).status).toBe(403)
    as(seed.users.admin)
    expect((await route.POST(post({ quantity: 21 }), params({ id: '00000000-0000-4000-8000-000000000000' }))).status).toBe(404)
  })

  it('a concurrent increase and decrease serialise under the row lock and agree with the pieces', async () => {
    const [a, b] = await Promise.all([
      route.POST(post({ quantity: 25 }), params({ id: li().id })),
      route.POST(post({ quantity: 18, reason: 'trim' }), params({ id: li().id })),
    ])
    expect([a.status, b.status]).toEqual([200, 200])
    const final = await testPrisma.orderLineItem.findUniqueOrThrow({ where: { id: li().id } })
    const live = await testPrisma.piece.count({ where: { lineItemId: li().id, state: { not: 'CANCELLED' } } })
    expect(live).toBe(final.quantity)
    expect([18, 25]).toContain(final.quantity)
  })
})
