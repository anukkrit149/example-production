import { beforeEach, describe, expect, it } from 'vitest'
import { resetTestDb, testPrisma } from '@hf/db/test'
import { seedAll, type SeedResult } from '@hf/db'
import { listFloorPieces, runPieceAction } from '@hf/server'

let seed: SeedResult
const photo = async () => (await testPrisma.attachment.create({ data: { storageKey: `t/${crypto.randomUUID()}.jpg`, mime: 'image/jpeg', bytes: 1, takenById: seed.users.store.id, confirmedAt: new Date() } })).id

describe('listFloorPieces', () => {
  beforeEach(async () => { await resetTestDb(); seed = await seedAll(testPrisma) })

  it('groups by stage, searches by code or style, pages newest activity first', async () => {
    const [a, b] = [seed.pieces[0]!, seed.pieces[1]!]
    await runPieceAction({ pieceId: a.id, user: seed.users.store, idempotencyKey: 'fp-a-act', event: { type: 'PIECE_ACTIVATED', stage: 'cutting' }, attachmentIds: [await photo()] })
    await runPieceAction({ pieceId: b.id, user: seed.users.store, idempotencyKey: 'fp-b-act', event: { type: 'PIECE_ACTIVATED', stage: 'cutting' }, attachmentIds: [await photo()] })
    await runPieceAction({ pieceId: b.id, user: seed.users.qa, idempotencyKey: 'fp-b-qa', event: { type: 'STAGE_QA_PASSED', stage: 'cutting' }, attachmentIds: [await photo()] })
    await runPieceAction({ pieceId: b.id, user: seed.users.store, idempotencyKey: 'fp-b-hold', event: { type: 'PIECE_HELD' }, details: { reason: 'x', heldFrom: 'CUT_OK' }, attachmentIds: [await photo()] })

    // Only a and b are moved off PLANNED, so "all" (every floor-work state, never PLANNED)
    // has exactly two rows — a limit of 1 is what exercises the next page here.
    const all = await listFloorPieces({ limit: 1 })
    expect(all.rows[0]!.id).toBe(b.id)
    expect(all.nextBefore).toBeTruthy()
    expect((await listFloorPieces({ group: 'on_hold' })).rows.map((r) => r.id)).toEqual([b.id])
    expect((await listFloorPieces({ group: 'cutting' })).rows.map((r) => r.id)).toEqual([a.id])
    expect((await listFloorPieces({ q: a.qrToken.slice(-6).toLowerCase() })).rows.map((r) => r.id)).toEqual([a.id])
    expect((await listFloorPieces({ q: 'TB-018', limit: 3 })).rows.every((r) => r.styleCode === 'TB-018')).toBe(true)
    const page2 = await listFloorPieces({ limit: 5, before: all.nextBefore! })
    expect(page2.rows.some((r) => r.id === b.id)).toBe(false)
  })
})
