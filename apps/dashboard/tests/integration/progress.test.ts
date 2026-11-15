import { beforeEach, describe, expect, it } from 'vitest'
import { testPrisma } from '@hf/db/test'
import type { SeedResult } from '@hf/db'
import { getLineItem, getOrder, getProgram, listOrders, listPrograms, pieceStateFilter, piecesCount, piecesWhere, runPieceAction } from '@hf/server'
import { AT_OR_PAST } from '@hf/domain'
import { freshSeed } from './helpers'

let seed: SeedResult

/** Push the first `n` pieces of a line item through cutting QA, the next `m` to activated only. */
async function advance(lineItemId: string, cutOk: number, cutPending: number) {
  const pieces = await testPrisma.piece.findMany({ where: { lineItemId }, orderBy: { serial: 'asc' }, take: cutOk + cutPending })
  for (const [i, p] of pieces.entries()) {
    await runPieceAction({ pieceId: p.id, user: seed.users.admin, idempotencyKey: `adv-a-${p.id}`, event: { type: 'PIECE_ACTIVATED', stage: 'cutting' }, details: { leatherLot: 'L', photoOverrideReason: 't' } })
    if (i < cutOk)
      await runPieceAction({ pieceId: p.id, user: seed.users.admin, idempotencyKey: `adv-q-${p.id}`, event: { type: 'STAGE_QA_PASSED', stage: 'cutting' }, details: { photoOverrideReason: 't' } })
  }
}

describe('progress', () => {
  beforeEach(async () => { seed = await freshSeed() })

  it('a fresh seed is not started with 65 ordered', async () => {
    const [p] = await listPrograms()
    expect(p).toMatchObject({ name: 'Autumn 26', orderCount: 1, buyer: { name: 'Nordheim GmbH' }, agent: { name: 'Pacific Sourcing' } })
    expect(p!.progress).toMatchObject({ ordered: 65, status: 'not_started', replaced: 0 })
    expect(p!.progress.counts).toMatchObject({ total: 65, cutting: 0 })
  })

  it('line item, order and program agree after some pieces move', async () => {
    const li = seed.lineItems[0]!   // LJ-204 M, 20
    await advance(li.id, 3, 2)
    const line = await getLineItem(li.id)
    expect(line!.progress.counts).toMatchObject({ total: 20, cutting: 3, pasting: 0, onHold: 0 })
    const order = await getOrder(li.orderId)
    expect(order!.progress).toMatchObject({ ordered: 65, status: 'in_production' })
    expect(order!.progress.counts).toMatchObject({ total: 65, cutting: 3 })
    expect(order!.lineItems).toHaveLength(3)
    const program = await getProgram(order!.programId)
    expect(program!.progress.counts.cutting).toBe(3)
    expect(program!.orders[0]!.progress.counts.cutting).toBe(3)
  })

  it('overdue once the due date passes; cancelled pieces lower nothing but are counted', async () => {
    const li = seed.lineItems[0]!
    await advance(li.id, 1, 0)
    await testPrisma.order.update({ where: { id: li.orderId }, data: { dueDate: new Date('2020-01-01') } })
    const order = await getOrder(li.orderId)
    expect(order!.progress.status).toBe('overdue')
    const victim = (await testPrisma.piece.findFirst({ where: { lineItemId: li.id, state: 'PLANNED' }, orderBy: { serial: 'desc' } }))!
    await runPieceAction({ pieceId: victim.id, user: seed.users.admin, idempotencyKey: 'prog-cancel', event: { type: 'PIECE_CANCELLED' }, details: { reason: 't' } })
    expect((await getLineItem(li.id))!.progress.counts).toMatchObject({ cancelled: 1, total: 20 })
  })

  it('replaced comes from lineage', async () => {
    const li = seed.lineItems[0]!
    await advance(li.id, 0, 1)
    const cut = (await testPrisma.piece.findFirst({ where: { lineItemId: li.id, state: 'CUT_PENDING_QA' } }))!
    const rejected = await runPieceAction({ pieceId: cut.id, user: seed.users.qa, idempotencyKey: 'prog-rej', event: { type: 'PIECE_REJECTED' }, details: { reason: 'cut_defect' } })
    const replacement = await testPrisma.piece.create({ data: { lineItemId: li.id, serial: 21, qrToken: 'HF-P-REPLACE1' } })
    await testPrisma.pieceLineage.create({ data: { rejectedPieceId: cut.id, replacementPieceId: replacement.id, reason: 'cut_defect', eventId: rejected.event.id } })
    const line = await getLineItem(li.id)
    expect(line!.progress).toMatchObject({ replaced: 1 })
    expect(line!.progress.counts).toMatchObject({ rejected: 1, total: 21 })
  })

  it('the piece list behind a count uses the same predicate as the count', async () => {
    const li = seed.lineItems[0]!
    await advance(li.id, 4, 3)
    const line = (await getLineItem(li.id))!
    const atCutting = await piecesWhere({ lineItemId: li.id, atOrPast: 'cutting' })
    expect(atCutting).toHaveLength(line.progress.counts.cutting)
    expect(atCutting.every((p) => AT_OR_PAST.cutting.includes(p.state))).toBe(true)
    const pending = await piecesWhere({ lineItemId: li.id, state: 'CUT_PENDING_QA' })
    expect(pending).toHaveLength(3)
    expect(pieceStateFilter({ atOrPast: 'packaging' })).toEqual(['PACKED', 'SHIPPED'])
    expect(pieceStateFilter({})).toBeUndefined()
  })

  it('piecesCount agrees with piecesWhere, even when the list would be truncated', async () => {
    const li = seed.lineItems[0]!   // 20 pieces
    expect(await piecesCount({ lineItemId: li.id })).toBe((await piecesWhere({ lineItemId: li.id })).length)
    expect(await piecesCount({ lineItemId: li.id })).toBe(20)

    await advance(li.id, 1, 0)
    expect(await piecesCount({ atOrPast: 'cutting' })).toBe((await piecesWhere({ atOrPast: 'cutting' })).length)
    expect(await piecesCount({ atOrPast: 'cutting' })).toBe(1)
  })

  it('piece rows carry what the table shows', async () => {
    const li = seed.lineItems[0]!
    await advance(li.id, 1, 0)
    const [row] = await piecesWhere({ lineItemId: li.id, atOrPast: 'cutting' })
    expect(row).toMatchObject({ serial: 1, state: 'CUT_OK', styleCode: 'LJ-204', size: 'M', shade: 'BLK-02', orderNumber: 'PO-4471', worker: null })
    expect(row!.lastEvent).toMatchObject({ type: 'LABEL_PRINT_REQUESTED' })
    expect(typeof row!.ageMinutes).toBe('number')
  })

  it('orders can be listed across programs and filtered by program', async () => {
    const all = await listOrders()
    expect(all).toHaveLength(1)
    expect(await listOrders({ programId: all[0]!.programId })).toHaveLength(1)
    expect(await listOrders({ programId: '00000000-0000-4000-8000-000000000000' })).toHaveLength(0)
  })
})
