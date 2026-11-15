import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resetTestDb, testPrisma } from '@hf/db/test'
import { seedAll, type SeedResult } from '@hf/db'
import { runPieceAction } from '@hf/server'

// One mutable identity the tests swap between roles. `requireUser` reads it
// through `cookies()`, so mocking next/headers is the whole auth seam.
const cookie = { value: 'dev:qa' }
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (n: string) => (n === 'hf_dev_user' && cookie.value ? { value: cookie.value } : undefined) }),
}))

const list = await import('@/app/api/pieces/route')

let seed: SeedResult
const params = () => ({ params: Promise.resolve({}) })
const get = (url = 'http://x/api/pieces') => new Request(url)
const photo = async () =>
  (await testPrisma.attachment.create({
    data: { storageKey: `t/${crypto.randomUUID()}.jpg`, mime: 'image/jpeg', bytes: 1, takenById: seed.users.store.id, confirmedAt: new Date() },
  })).id

describe('GET /api/pieces', () => {
  beforeEach(async () => {
    await resetTestDb()
    seed = await seedAll(testPrisma)
    process.env.DEV_AUTH = 'true'
    cookie.value = 'dev:qa'
  })

  it('signed out is 401; a QA user can read', async () => {
    cookie.value = ''
    expect((await list.GET(get(), params())).status).toBe(401)

    cookie.value = 'dev:qa'
    const res = await list.GET(get(), params())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body.rows)).toBe(true)
    expect(body).toHaveProperty('nextBefore')
  })

  it('?group=on_hold returns only held pieces', async () => {
    const [a, b] = [seed.pieces[0]!, seed.pieces[1]!]
    await runPieceAction({ pieceId: a.id, user: seed.users.store, idempotencyKey: 'plr-a-act', event: { type: 'PIECE_ACTIVATED', stage: 'cutting' }, attachmentIds: [await photo()] })
    await runPieceAction({ pieceId: b.id, user: seed.users.store, idempotencyKey: 'plr-b-act', event: { type: 'PIECE_ACTIVATED', stage: 'cutting' }, attachmentIds: [await photo()] })
    await runPieceAction({ pieceId: b.id, user: seed.users.qa, idempotencyKey: 'plr-b-qa', event: { type: 'STAGE_QA_PASSED', stage: 'cutting' }, attachmentIds: [await photo()] })
    await runPieceAction({ pieceId: b.id, user: seed.users.store, idempotencyKey: 'plr-b-hold', event: { type: 'PIECE_HELD' }, details: { reason: 'x', heldFrom: 'CUT_OK' }, attachmentIds: [await photo()] })

    const res = await list.GET(get('http://x/api/pieces?group=on_hold'), params())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.rows.map((r: { id: string }) => r.id)).toEqual([b.id])
  })

  it('?q= matches by style code', async () => {
    const piece = await testPrisma.piece.findFirstOrThrow({ where: { lineItem: { style: { styleCode: 'TB-018' } } } })
    await runPieceAction({ pieceId: piece.id, user: seed.users.store, idempotencyKey: 'plr-q-act', event: { type: 'PIECE_ACTIVATED', stage: 'cutting' }, attachmentIds: [await photo()] })

    const res = await list.GET(get('http://x/api/pieces?q=TB-018'), params())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.rows.length).toBeGreaterThan(0)
    expect(body.rows.every((r: { styleCode: string }) => r.styleCode === 'TB-018')).toBe(true)
  })

  it('?group=bogus is a 400', async () => {
    const res = await list.GET(get('http://x/api/pieces?group=bogus'), params())
    expect(res.status).toBe(400)
  })

  it('before pages without repeating rows', async () => {
    const [a, b] = [seed.pieces[0]!, seed.pieces[1]!]
    await runPieceAction({ pieceId: a.id, user: seed.users.store, idempotencyKey: 'plr2-a-act', event: { type: 'PIECE_ACTIVATED', stage: 'cutting' }, attachmentIds: [await photo()] })
    await runPieceAction({ pieceId: b.id, user: seed.users.store, idempotencyKey: 'plr2-b-act', event: { type: 'PIECE_ACTIVATED', stage: 'cutting' }, attachmentIds: [await photo()] })

    const page1 = await list.GET(get('http://x/api/pieces?group=cutting'), params())
    const body1 = await page1.json()
    expect(body1.rows).toHaveLength(2)
    // b was activated last, so it is newest and comes first; its cursor is
    // built the same way `listFloorPieces` builds `nextBefore`, to page past it.
    const firstRow = body1.rows[0]
    expect(firstRow.id).toBe(b.id)
    const before = `${firstRow.updatedAt}|${firstRow.id}`

    const page2 = await list.GET(get(`http://x/api/pieces?group=cutting&before=${encodeURIComponent(before)}`), params())
    const body2 = await page2.json()
    expect(body2.rows.some((r: { id: string }) => r.id === b.id)).toBe(false)
    expect(body2.rows.map((r: { id: string }) => r.id)).toEqual([a.id])
  })
})
