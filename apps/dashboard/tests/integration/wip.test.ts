import { beforeEach, describe, expect, it } from 'vitest'
import { testPrisma } from '@hf/db/test'
import type { SeedResult } from '@hf/db'
import { awaitingQa, onHold, runPieceAction, withWorkers } from '@hf/server'
import { freshSeed } from './helpers'

let seed: SeedResult
const act = (pieceId: string, key: string, event: Parameters<typeof runPieceAction>[0]['event'], extra: Partial<Parameters<typeof runPieceAction>[0]> = {}) =>
  runPieceAction({ pieceId, user: seed.users.admin, idempotencyKey: key, event, details: { photoOverrideReason: 't', leatherLot: 'L', ...(extra.details ?? {}) }, ...extra })
const photo = async () =>
  (await testPrisma.attachment.create({ data: { storageKey: `t/${crypto.randomUUID()}.jpg`, mime: 'image/jpeg', bytes: 1, takenById: seed.users.store.id, confirmedAt: new Date() } })).id

describe('wip', () => {
  beforeEach(async () => { seed = await freshSeed() })

  it('empty floor', async () => {
    expect(await withWorkers()).toEqual([])
    expect(await awaitingQa()).toEqual([])
    expect(await onHold()).toEqual([])
  })

  it('pieces awaiting QA group by stage', async () => {
    const [a, b] = seed.pieces
    await act(a!.id, 'w1', { type: 'PIECE_ACTIVATED', stage: 'cutting' })
    await act(b!.id, 'w2', { type: 'PIECE_ACTIVATED', stage: 'cutting' })
    const qa = await awaitingQa()
    expect(qa).toHaveLength(1)
    expect(qa[0]).toMatchObject({ stage: 'cutting', count: 2 })
    expect(qa[0]!.pieces.map((p) => p.serial)).toEqual([1, 2])
  })

  it('pieces with a worker group by worker and stage', async () => {
    const p = seed.pieces[0]!
    const paster = seed.workers.find((w) => w.type === 'paster')!
    await act(p.id, 'w3', { type: 'PIECE_ACTIVATED', stage: 'cutting' })
    await act(p.id, 'w4', { type: 'STAGE_QA_PASSED', stage: 'cutting' })
    await act(p.id, 'w5', { type: 'ISSUED', stage: 'pasting' }, { workerId: paster.id, afterWorker: paster.id })
    const wip = await withWorkers()
    expect(wip).toHaveLength(1)
    expect(wip[0]).toMatchObject({ worker: { name: paster.name, type: 'paster' }, stage: 'pasting', count: 1 })
    expect(wip[0]!.pieces[0]!.worker).toBe(paster.name)
  })

  it('two pieces issued to two different pasters land in two groups', async () => {
    const [a, b] = seed.pieces
    const firstPaster = seed.workers.find((w) => w.type === 'paster')!
    const secondPaster = await testPrisma.worker.create({ data: { name: 'Paster Two', type: 'paster' } })
    await act(a!.id, 'w8', { type: 'PIECE_ACTIVATED', stage: 'cutting' })
    await act(a!.id, 'w9', { type: 'STAGE_QA_PASSED', stage: 'cutting' })
    await act(a!.id, 'w10', { type: 'ISSUED', stage: 'pasting' }, { workerId: firstPaster.id, afterWorker: firstPaster.id })
    await act(b!.id, 'w11', { type: 'PIECE_ACTIVATED', stage: 'cutting' })
    await act(b!.id, 'w12', { type: 'STAGE_QA_PASSED', stage: 'cutting' })
    await act(b!.id, 'w13', { type: 'ISSUED', stage: 'pasting' }, { workerId: secondPaster.id, afterWorker: secondPaster.id })
    const wip = await withWorkers()
    expect(wip).toHaveLength(2)
    expect(wip.every((g) => g.count === 1)).toBe(true)
    const workerIds = wip.map((g) => g.worker.id).sort()
    expect(workerIds).toEqual([firstPaster.id, secondPaster.id].sort())
  })

  it('held pieces carry the reason and who held them', async () => {
    const p = seed.pieces[0]!
    await act(p.id, 'w6', { type: 'PIECE_ACTIVATED', stage: 'cutting' })
    await runPieceAction({ pieceId: p.id, user: seed.users.supervisor, idempotencyKey: 'w7', event: { type: 'PIECE_HELD' }, details: { reason: 'waiting on lining' }, attachmentIds: [await photo()] })
    const held = await onHold()
    expect(held).toHaveLength(1)
    expect(held[0]).toMatchObject({ reason: 'waiting on lining', heldBy: 'Supervisor' })
    expect(held[0]!.piece.state).toBe('ON_HOLD')
    expect(await testPrisma.piece.count({ where: { state: 'ON_HOLD' } })).toBe(1)
  })
})
