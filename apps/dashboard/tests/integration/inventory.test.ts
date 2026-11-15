import { beforeEach, describe, expect, it, vi } from 'vitest'
import { testPrisma } from '@hf/db/test'
import type { SeedResult } from '@hf/db'
import { listInventoryItems, recordReceipt, stockOnHand } from '@hf/server'
import { as, freshSeed, nextHeadersMock, authServerMock, params, patch, post, read } from './helpers'

vi.mock('next/headers', () => nextHeadersMock())
vi.mock('@/lib/auth-server', () => authServerMock())

const create = await import('@/app/api/inventory/items/route')
const update = await import('@/app/api/inventory/items/[id]/route')

let seed: SeedResult

describe('inventory items api', () => {
  beforeEach(async () => { seed = await freshSeed(); as(seed.users.admin) })

  it('admin creates an item; the code is uppercased; a replay is 200', async () => {
    const key = crypto.randomUUID()
    const res = await create.POST(post({ code: 'btn', nameEn: 'Button', nameHi: 'बटन', position: 4 }, key), params())
    expect(res.status).toBe(201)
    expect((await read(res)).item).toMatchObject({ code: 'BTN', unit: 'pcs', position: 4, active: true })
    expect((await create.POST(post({ code: 'btn', nameEn: 'Button', nameHi: 'बटन', position: 4 }, key), params())).status).toBe(200)
    expect((await listInventoryItems()).map((i) => i.code)).toEqual(['ZIP', 'WASH-LBL', 'PO-LBL', 'BTN'])
  })

  it('a duplicate code is a readable 409; a bad code names the field', async () => {
    const res = await create.POST(post({ code: 'zip', nameEn: 'Zip', nameHi: 'ज़िप' }), params())
    expect(res.status).toBe(409)
    expect((await read(res)).error).toEqual({ code: 'conflict', message: 'Item code ZIP is already taken' })
    const bad = await create.POST(post({ code: 'a', nameEn: 'x', nameHi: 'य' }), params())
    expect(bad.status).toBe(400)
    expect((await read(bad)).error).toMatchObject({ code: 'validation', message: 'Code: must be 2–16 letters, digits or hyphens' })
  })

  it('update changes names, unit, position and active but never the code', async () => {
    const res = await update.PATCH(patch({ nameEn: 'Zipper', unit: 'm', active: false, code: 'NEW' }), params({ id: seed.items[0]!.id }))
    expect(res.status).toBe(200)
    expect((await read(res)).item).toMatchObject({ code: 'ZIP', nameEn: 'Zipper', unit: 'm', active: false })
    expect((await update.PATCH(patch({ nameEn: 'x' }), params({ id: crypto.randomUUID() }))).status).toBe(404)
  })

  it('store, merchandiser and management are 403; signed out is 401', async () => {
    for (const u of [seed.users.store, seed.users.merchandiser, seed.users.management]) {
      as(u)
      expect((await create.POST(post({ code: 'X1', nameEn: 'x', nameHi: 'य' }), params())).status).toBe(403)
      expect((await update.PATCH(patch({ nameEn: 'x' }), params({ id: seed.items[0]!.id }))).status).toBe(403)
    }
    as({ authIdentity: '' })
    expect((await create.POST(post({ code: 'X1', nameEn: 'x', nameHi: 'य' }), params())).status).toBe(401)
  })
})

describe('inventory read models for the pages', () => {
  beforeEach(async () => { seed = await freshSeed() })

  it('stock tiles read zero before any receipt and the awaiting count after one', async () => {
    expect((await stockOnHand()).map((s) => [s.item.code, s.onHand, s.awaitingCount])).toEqual([['ZIP', 0, 0], ['WASH-LBL', 0, 0], ['PO-LBL', 0, 0]])
    const photo = async () => (await testPrisma.attachment.create({ data: { storageKey: `t/${crypto.randomUUID()}.jpg`, mime: 'image/jpeg', bytes: 1, takenById: seed.users.store.id, confirmedAt: new Date() } })).id
    await recordReceipt({ user: seed.users.store, idempotencyKey: 'dash-1234567890', input: { attachmentIds: [], items: [{ itemId: seed.items[0]!.id, expectedQty: 10 }], photos: { goods: [await photo()], place: [await photo()], document: [await photo()] } } })
    expect((await stockOnHand())[0]).toMatchObject({ onHand: 0, awaitingCount: 1 })
  })
})
