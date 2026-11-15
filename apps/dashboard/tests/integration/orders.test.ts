import { beforeEach, describe, expect, it, vi } from 'vitest'
import { testPrisma } from '@hf/db/test'
import type { SeedResult } from '@hf/db'
import { as, freshSeed, nextHeadersMock, authServerMock, params, patch, post, read } from './helpers'

vi.mock('next/headers', () => nextHeadersMock())
vi.mock('@/lib/auth-server', () => authServerMock())

const create = await import('@/app/api/orders/route')
const update = await import('@/app/api/orders/[id]/route')

let seed: SeedResult
const program = () => testPrisma.program.findFirstOrThrow({ where: { name: 'Autumn 26' } })

describe('orders', () => {
  beforeEach(async () => { seed = await freshSeed(); as(seed.users.merchandiser) })

  it('creates an order with a due date stored as a date', async () => {
    const res = await create.POST(post({ programId: (await program()).id, orderNumber: 'PO-4472', dueDate: '2026-12-01' }), params())
    expect(res.status).toBe(201)
    const b = await read<{ order: { id: string; orderNumber: string; dueDate: string } }>(res)
    expect(b.order.orderNumber).toBe('PO-4472')
    expect(b.order.dueDate).toBe('2026-12-01')
  })

  it('a duplicate order number in the same program is a readable 409', async () => {
    const res = await create.POST(post({ programId: (await program()).id, orderNumber: 'PO-4471' }), params())
    expect(res.status).toBe(409)
    expect((await read(res)).error).toEqual({ code: 'conflict', message: 'Order PO-4471 already exists in Autumn 26' })
  })

  it('the same order number is fine in another program', async () => {
    const buyer = await testPrisma.organization.findFirstOrThrow({ where: { type: 'buyer' } })
    const other = await testPrisma.program.create({ data: { name: 'Other', buyerId: buyer.id } })
    expect((await create.POST(post({ programId: other.id, orderNumber: 'PO-4471' }), params())).status).toBe(201)
  })

  it('unknown program is 404', async () => {
    expect((await create.POST(post({ programId: '00000000-0000-4000-8000-000000000000', orderNumber: 'X' }), params())).status).toBe(404)
  })

  it('replays a key', async () => {
    const key = 'order-key-0001'
    const p = (await program()).id
    const a = await read<{ order: { id: string } }>(await create.POST(post({ programId: p, orderNumber: 'PO-9' }, key), params()))
    const res = await create.POST(post({ programId: p, orderNumber: 'PO-9' }, key), params())
    expect(res.status).toBe(200)
    expect((await read<{ order: { id: string } }>(res)).order.id).toBe(a.order.id)
  })

  it('management gets 403', async () => {
    as(seed.users.management)
    expect((await create.POST(post({ programId: (await program()).id, orderNumber: 'X' }), params())).status).toBe(403)
  })

  it('edits the number and due date, and renaming onto a taken number is 409', async () => {
    const p = (await program()).id
    const second = await testPrisma.order.create({ data: { programId: p, orderNumber: 'PO-4480' } })
    let res = await update.PATCH(patch({ orderNumber: 'PO-4481', dueDate: null }), params({ id: second.id }))
    expect(res.status).toBe(200)
    const b = await read<{ order: { orderNumber: string; dueDate: string | null } }>(res)
    expect(b.order.dueDate).toBeNull()
    expect(await testPrisma.order.findUniqueOrThrow({ where: { id: second.id } })).toMatchObject({ orderNumber: 'PO-4481', dueDate: null })
    res = await update.PATCH(patch({ orderNumber: 'PO-4471' }), params({ id: second.id }))
    expect(res.status).toBe(409)
    expect((await read<{ error: { message: string } }>(res)).error.message).toBe('Order PO-4471 already exists in Autumn 26')
  })
})
