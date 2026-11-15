import { beforeEach, describe, expect, it } from 'vitest'
import { testPrisma } from '@hf/db/test'
import type { SeedResult } from '@hf/db'
import { cartonsForOrder, ordersWithPacked, shipCarton } from '@hf/server'
import { freshSeed, packPiece } from './helpers'

let seed: SeedResult
const photo = async () => (await testPrisma.attachment.create({ data: { storageKey: `t/${crypto.randomUUID()}.jpg`, mime: 'image/jpeg', bytes: 1, takenById: seed.users.store.id } })).id

describe('cartons', () => {
  beforeEach(async () => { seed = await freshSeed() })

  it('lists cartons of an order from PACKED events, with shipped state', async () => {
    await packPiece(seed, 0, 'CTN-01'); await packPiece(seed, 1, 'CTN-01'); await packPiece(seed, 2, 'CTN-02')
    const order = await testPrisma.order.findFirstOrThrow()
    const rows = await cartonsForOrder(order.id)
    expect(rows.map((r) => [r.carton, r.packed, r.shipped])).toEqual([['CTN-01', 2, 0], ['CTN-02', 1, 0]])
  })

  it('ships every packed piece of a carton once; a replay changes nothing; an empty carton is 422', async () => {
    await packPiece(seed, 0, 'CTN-01'); await packPiece(seed, 1, 'CTN-01'); await packPiece(seed, 2, 'CTN-02')
    const order = await testPrisma.order.findFirstOrThrow()
    const r = await shipCarton({ orderId: order.id, carton: 'CTN-01', user: seed.users.store, idempotencyKey: 'ship-1', attachmentIds: [await photo()], details: {} })
    expect(r.shipped).toBe(2)
    expect(await testPrisma.piece.count({ where: { state: 'SHIPPED' } })).toBe(2)
    const again = await shipCarton({ orderId: order.id, carton: 'CTN-01', user: seed.users.store, idempotencyKey: 'ship-1', attachmentIds: [], details: {} })
    expect(again.replayed).toBe(true)
    expect(await testPrisma.pieceEvent.count({ where: { eventType: 'SHIPPED' } })).toBe(2)
    await expect(shipCarton({ orderId: order.id, carton: 'CTN-09', user: seed.users.store, idempotencyKey: 'ship-9', attachmentIds: [await photo()], details: {} })).rejects.toMatchObject({ code: 'carton_empty' })
    expect((await cartonsForOrder(order.id))[0]).toMatchObject({ carton: 'CTN-01', packed: 2, shipped: 2 })
  })

  it('rolls packed pieces up to their order for the ship picker', async () => {
    await packPiece(seed, 0, 'CTN-01'); await packPiece(seed, 1, 'CTN-01')
    const order = await testPrisma.order.findFirstOrThrow()
    const rows = await ordersWithPacked()
    expect(rows).toEqual([{ orderId: order.id, orderNumber: order.orderNumber, programName: expect.any(String), packed: 2 }])
  })
})
