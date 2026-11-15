import { beforeEach, describe, expect, it } from 'vitest'
import { resetTestDb, testPrisma } from '@hf/db/test'
import { seedAll, type SeedResult } from '@hf/db'
import { runPieceAction, ApiError } from '@hf/server'

let seed: SeedResult
const photo = async (userId: string) =>
  (await testPrisma.attachment.create({ data: { storageKey: `t/${crypto.randomUUID()}.jpg`, mime: 'image/jpeg', bytes: 1000, takenById: userId } })).id

describe('runPieceAction', () => {
  beforeEach(async () => { await resetTestDb(); seed = await seedAll(testPrisma) })

  it('activates a planned piece with a photo and bumps the version', async () => {
    const piece = seed.pieces[0]!
    const r = await runPieceAction({
      pieceId: piece.id, user: seed.users.store, idempotencyKey: 'act-1', expectedVersion: 0,
      event: { type: 'PIECE_ACTIVATED', stage: 'cutting' }, details: { leatherLot: 'LOT-22' }, attachmentIds: [await photo(seed.users.store.id)],
    })
    expect(r.piece.state).toBe('CUT_PENDING_QA'); expect(r.piece.version).toBe(1); expect(r.replayed).toBe(false)
    const att = await testPrisma.attachment.findFirst({ where: { pieceEventId: r.event.id } })
    expect(att).not.toBeNull()
  })

  it('replays the same idempotency key without writing again', async () => {
    const piece = seed.pieces[0]!
    const args = { pieceId: piece.id, user: seed.users.store, idempotencyKey: 'act-2', event: { type: 'PIECE_ACTIVATED' as const, stage: 'cutting' as const }, attachmentIds: [await photo(seed.users.store.id)] }
    const a = await runPieceAction(args)
    const b = await runPieceAction(args)
    expect(b.replayed).toBe(true); expect(b.event.id).toBe(a.event.id)
    expect(await testPrisma.pieceEvent.count({ where: { pieceId: piece.id } })).toBe(1)
  })

  it('rejects a stale version', async () => {
    const piece = seed.pieces[1]!
    await runPieceAction({ pieceId: piece.id, user: seed.users.store, idempotencyKey: 'act-3', event: { type: 'PIECE_ACTIVATED', stage: 'cutting' }, attachmentIds: [await photo(seed.users.store.id)] })
    await expect(runPieceAction({ pieceId: piece.id, user: seed.users.qa, idempotencyKey: 'qa-3', expectedVersion: 0, event: { type: 'STAGE_QA_PASSED', stage: 'cutting' }, attachmentIds: [await photo(seed.users.qa.id)] }))
      .rejects.toMatchObject({ status: 409 })
  })

  it('rejects an invalid transition server-side', async () => {
    const piece = seed.pieces[2]!
    await expect(runPieceAction({ pieceId: piece.id, user: seed.users.store, idempotencyKey: 'bad-1', event: { type: 'ISSUED', stage: 'pasting' }, attachmentIds: [await photo(seed.users.store.id)] }))
      .rejects.toMatchObject({ status: 422, code: 'invalid_transition' })
  })

  it('requires a photo unless a supervisor overrides', async () => {
    const piece = seed.pieces[3]!
    await expect(runPieceAction({ pieceId: piece.id, user: seed.users.store, idempotencyKey: 'np-1', event: { type: 'PIECE_ACTIVATED', stage: 'cutting' } }))
      .rejects.toMatchObject({ status: 422, code: 'photo_required' })
    const r = await runPieceAction({ pieceId: piece.id, user: seed.users.supervisor, idempotencyKey: 'np-2', event: { type: 'PIECE_ACTIVATED', stage: 'cutting' }, details: { photoOverrideReason: 'camera broken' } })
    expect(r.piece.state).toBe('CUT_PENDING_QA')
  })

  it('cutting QA pass creates a blue label request', async () => {
    const piece = seed.pieces[4]!
    await runPieceAction({ pieceId: piece.id, user: seed.users.store, idempotencyKey: 'a-5', event: { type: 'PIECE_ACTIVATED', stage: 'cutting' }, attachmentIds: [await photo(seed.users.store.id)] })
    await runPieceAction({ pieceId: piece.id, user: seed.users.qa, idempotencyKey: 'q-5', event: { type: 'STAGE_QA_PASSED', stage: 'cutting' }, attachmentIds: [await photo(seed.users.qa.id)] })
    const label = await testPrisma.labelPrint.findFirst({ where: { pieceId: piece.id, kind: 'stage' } })
    expect(label).toMatchObject({ stage: 'cutting', template: 't50x25', printedAt: null })
    expect(await testPrisma.pieceEvent.count({ where: { pieceId: piece.id, eventType: 'LABEL_PRINT_REQUESTED' } })).toBe(1)
  })

  it('two concurrent actions on the same version: one wins, one conflicts', async () => {
    const piece = seed.pieces[5]!
    // Both attachments are created up front. Awaiting them inside the
    // Promise.allSettled array would stagger the two calls and let this test
    // pass even with no row lock at all, which defeats its whole purpose.
    const [p1, p2] = [await photo(seed.users.store.id), await photo(seed.users.store.id)]
    const results = await Promise.allSettled([
      runPieceAction({ pieceId: piece.id, user: seed.users.store, idempotencyKey: 'c-1', expectedVersion: 0, event: { type: 'PIECE_ACTIVATED', stage: 'cutting' }, attachmentIds: [p1] }),
      runPieceAction({ pieceId: piece.id, user: seed.users.store, idempotencyKey: 'c-2', expectedVersion: 0, event: { type: 'PIECE_ACTIVATED', stage: 'cutting' }, attachmentIds: [p2] }),
    ])
    const ok = results.filter((r) => r.status === 'fulfilled').length
    const conflict = results.filter((r) => r.status === 'rejected' && (r.reason as ApiError).status === 409).length
    expect(ok).toBe(1); expect(conflict).toBe(1)

    // The invariants the lock actually protects: exactly one write landed.
    const after = await testPrisma.piece.findUniqueOrThrow({ where: { id: piece.id } })
    expect(after.version).toBe(1)
    expect(await testPrisma.pieceEvent.count({ where: { pieceId: piece.id } })).toBe(1)
  })

  it('accepts a photo shared from another event and records photoFromEventId', async () => {
    const piece = seed.pieces[6]!
    const activated = await runPieceAction({
      pieceId: piece.id, user: seed.users.store, idempotencyKey: 'shared-act-1',
      event: { type: 'PIECE_ACTIVATED', stage: 'cutting' }, attachmentIds: [await photo(seed.users.store.id)],
    })
    await runPieceAction({ pieceId: piece.id, user: seed.users.qa, idempotencyKey: 'shared-qa-1', event: { type: 'STAGE_QA_PASSED', stage: 'cutting' }, attachmentIds: [await photo(seed.users.qa.id)] })
    const w = seed.workers[1]!
    const r = await runPieceAction({
      pieceId: piece.id, user: seed.users.store, idempotencyKey: 'shared-iss-1',
      event: { type: 'ISSUED', stage: 'pasting' }, workerId: w.id, afterWorker: w.id,
      photoSharedWithEventId: activated.event.id,
    })
    expect(r.replayed).toBe(false)
    expect(r.event.details).toMatchObject({ photoFromEventId: activated.event.id })
  })

  it('runs inside a caller-supplied transaction and rolls back with it', async () => {
    const piece = seed.pieces[0]!
    await expect(
      testPrisma.$transaction(async (tx) => {
        const r = await runPieceAction({
          tx,
          pieceId: piece.id,
          user: seed.users.admin,
          idempotencyKey: 'tx-cancel-1',
          event: { type: 'PIECE_CANCELLED' },
          details: { reason: 'test' },
        })
        expect(r.piece.state).toBe('CANCELLED')
        throw new Error('abort')
      }),
    ).rejects.toThrow('abort')

    const after = await testPrisma.piece.findUniqueOrThrow({ where: { id: piece.id } })
    expect(after.state).toBe('PLANNED')
    expect(await testPrisma.pieceEvent.count({ where: { idempotencyKey: 'tx-cancel-1' } })).toBe(0)
  })
})
