import { beforeEach, describe, expect, it, vi } from 'vitest'
import { testPrisma } from '@hf/db/test'
import type { SeedResult } from '@hf/db'
import { as, freshSeed, nextHeadersMock, authServerMock, params, post, read } from './helpers'

vi.mock('next/headers', () => nextHeadersMock())
vi.mock('@/lib/auth-server', () => authServerMock())

const create = await import('@/app/api/line-items/route')

let seed: SeedResult
const order = () => testPrisma.order.findFirstOrThrow({ where: { orderNumber: 'PO-4471' } })
const jacket = () => testPrisma.style.findUniqueOrThrow({ where: { styleCode: 'LJ-204' } })
const bag = () => testPrisma.style.findUniqueOrThrow({ where: { styleCode: 'TB-018' } })

describe('line items', () => {
  beforeEach(async () => { seed = await freshSeed(); as(seed.users.merchandiser) })

  it('creates the line item and exactly that many PLANNED pieces with serials 1..n and unique tokens', async () => {
    const res = await create.POST(post({ orderId: (await order()).id, styleId: (await jacket()).id, size: 'S', shade: 'BLK-02', quantity: 12 }), params())
    expect(res.status).toBe(201)
    const b = await read<{ lineItem: { id: string; quantity: number }; plannedCount: number; replayed: boolean }>(res)
    expect(b.plannedCount).toBe(12)
    expect(b.replayed).toBe(false)
    const pieces = await testPrisma.piece.findMany({ where: { lineItemId: b.lineItem.id }, orderBy: { serial: 'asc' } })
    expect(pieces.map((p) => p.serial)).toEqual(Array.from({ length: 12 }, (_, i) => i + 1))
    expect(pieces.every((p) => p.state === 'PLANNED')).toBe(true)
    expect(new Set(pieces.map((p) => p.qrToken)).size).toBe(12)
    for (const p of pieces) expect(p.qrToken).toMatch(/^HF-P-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/)
  })

  it('a size outside the category is 422 and creates nothing', async () => {
    const before = await testPrisma.piece.count()
    const res = await create.POST(post({ orderId: (await order()).id, styleId: (await bag()).id, size: 'M', shade: 'TAN-02', quantity: 3 }), params())
    expect(res.status).toBe(422)
    expect((await read(res)).error).toEqual({ code: 'invalid_size', message: 'size M is not valid for a bag; use ONE' })
    expect(await testPrisma.piece.count()).toBe(before)
    expect(await testPrisma.orderLineItem.count()).toBe(3)
  })

  it('an inactive style is 422', async () => {
    const j = await jacket()
    await testPrisma.style.update({ where: { id: j.id }, data: { active: false } })
    const res = await create.POST(post({ orderId: (await order()).id, styleId: j.id, size: 'S', shade: 'BLK-02', quantity: 1 }), params())
    expect(res.status).toBe(422)
    expect((await read(res)).error).toMatchObject({ code: 'invalid_style' })
  })

  it('the existing variant is a readable 409', async () => {
    const res = await create.POST(post({ orderId: (await order()).id, styleId: (await jacket()).id, size: 'M', shade: 'BLK-02', quantity: 5 }), params())
    expect(res.status).toBe(409)
    expect((await read(res)).error).toEqual({ code: 'conflict', message: 'LJ-204 M BLK-02 is already on PO-4471. Change its quantity instead.' })
  })

  it('replaying the key returns the same line item and generates no more pieces', async () => {
    const key = 'li-key-000001'
    const body = { orderId: (await order()).id, styleId: (await jacket()).id, size: 'XL', shade: 'BLK-02', quantity: 4 }
    const a = await read<{ lineItem: { id: string } }>(await create.POST(post(body, key), params()))
    const res = await create.POST(post(body, key), params())
    expect(res.status).toBe(200)
    const b = await read<{ lineItem: { id: string }; plannedCount: number; replayed: boolean }>(res)
    expect(b).toMatchObject({ replayed: true, plannedCount: 4 })
    expect(b.lineItem.id).toBe(a.lineItem.id)
    expect(await testPrisma.piece.count({ where: { lineItemId: a.lineItem.id } })).toBe(4)
  })

  it('unknown order is 404; management is 403', async () => {
    expect((await create.POST(post({ orderId: '00000000-0000-4000-8000-000000000000', styleId: (await jacket()).id, size: 'S', shade: 'X', quantity: 1 }), params())).status).toBe(404)
    as(seed.users.management)
    expect((await create.POST(post({ orderId: (await order()).id, styleId: (await jacket()).id, size: 'S', shade: 'X', quantity: 1 }), params())).status).toBe(403)
  })

  it('a large line item lands in one round trip of pieces', async () => {
    const res = await create.POST(post({ orderId: (await order()).id, styleId: (await bag()).id, size: 'ONE', shade: 'BLK-09', quantity: 500 }), params())
    expect(res.status).toBe(201)
    expect((await read<{ plannedCount: number }>(res)).plannedCount).toBe(500)
  })
})
