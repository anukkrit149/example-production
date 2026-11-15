import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resetTestDb, testPrisma } from '@hf/db/test'
import { seedAll, type SeedResult } from '@hf/db'
import { runPieceAction } from '@hf/server'

const cookie = { value: 'dev:store' }
vi.mock('next/headers', () => ({ cookies: async () => ({ get: (n: string) => (n === 'hf_dev_user' && cookie.value ? { value: cookie.value } : undefined) }) }))
const route = await import('@/app/api/line-items/[id]/next-planned/route')
const params = (p: Record<string, string>) => ({ params: Promise.resolve(p) })
let seed: SeedResult

describe('next planned piece', () => {
  beforeEach(async () => { await resetTestDb(); seed = await seedAll(testPrisma); process.env.DEV_AUTH = 'true'; cookie.value = 'dev:store' })

  it('returns the lowest-serial planned piece of the line item', async () => {
    const li = seed.lineItems[0]!
    const res = await route.GET(new Request('http://x'), params({ id: li.id }))
    expect(res.status).toBe(200)
    expect((await res.json()).pieceId).toBe(seed.pieces.find((p) => p.lineItemId === li.id && p.serial === 1)!.id)
  })

  it('404 when nothing is planned on it', async () => {
    const li = seed.lineItems[2]!   // 30 bags
    for (const p of seed.pieces.filter((p) => p.lineItemId === li.id))
      await runPieceAction({ pieceId: p.id, user: seed.users.merchandiser, idempotencyKey: `c-${p.id}`, event: { type: 'PIECE_CANCELLED' }, details: { reason: 'test' } })
    const res = await route.GET(new Request('http://x'), params({ id: li.id }))
    expect(res.status).toBe(404)
    expect((await res.json()).error.code).toBe('no_planned_piece')
  })
})
