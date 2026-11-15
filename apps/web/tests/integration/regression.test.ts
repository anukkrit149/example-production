import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { resetTestDb, testPrisma } from '@hf/db/test'
import { seedAll, type SeedResult } from '@hf/db'
import { ApiError, handle, json, loadPieceView, runPieceAction } from '@hf/server'
import { formatEventType, formatSerial, formatState } from '@hf/server/format'

const cookie = { value: 'dev:store' }
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (n: string) => (n === 'hf_dev_user' && cookie.value ? { value: cookie.value } : undefined) }),
}))

/**
 * Every route handler the phone calls, by file. If a move or a rename breaks an
 * import, the module fails to load and this is the test that says which one.
 * `import.meta.glob` is resolved by Vite at test time, so a new route is
 * picked up automatically.
 */
const routeModules = import.meta.glob('../../app/api/**/route.ts')

let seed: SeedResult

describe('checkpoint regression: routes still load and answer', () => {
  it('every api route module imports and exports at least one HTTP method', async () => {
    const paths = Object.keys(routeModules).sort()
    expect(paths.length).toBeGreaterThanOrEqual(19)   // the count on master before this work
    for (const p of paths) {
      const mod = (await routeModules[p]!()) as Record<string, unknown>
      const methods = ['GET', 'POST', 'PATCH', 'DELETE'].filter((m) => typeof mod[m] === 'function')
      expect(methods, `${p} exports no handler`).not.toHaveLength(0)
    }
  })

  it('unauthenticated calls still get the same 401 envelope', async () => {
    cookie.value = ''
    process.env.DEV_AUTH = 'true'
    const lineItems = await import('@/app/api/line-items/route')
    const res = await lineItems.GET(new Request('http://x'), { params: Promise.resolve({}) })
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: { code: 'unauthenticated', message: 'sign in required' } })
  })
})

describe('checkpoint regression: error envelope', () => {
  const ctx = { params: Promise.resolve({}) }
  it('ApiError keeps its status and code', async () => {
    const res = await handle(async () => { throw new ApiError(409, 'changed', 'version_conflict') })(new Request('http://x'), ctx)
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: { code: 'version_conflict', message: 'changed' } })
  })
  it('ZodError is a 400 validation with issues', async () => {
    const res = await handle(async () => { z.object({ a: z.string() }).parse({}); return json({}) })(new Request('http://x'), ctx)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('validation')
    expect(Array.isArray(body.error.issues)).toBe(true)
  })
  it('anything else is a 500 internal without leaking the message', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await handle(async () => { throw new Error('secret detail') })(new Request('http://x'), ctx)
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: { code: 'internal', message: 'internal error' } })
    spy.mockRestore()
  })
})

describe('checkpoint regression: the single piece write path', () => {
  beforeEach(async () => {
    await resetTestDb()
    seed = await seedAll(testPrisma)
    cookie.value = 'dev:store'
    process.env.DEV_AUTH = 'true'
  })

  it('without tx it still opens its own transaction: a failed action leaves no event', async () => {
    const piece = seed.pieces[0]!
    await expect(
      runPieceAction({ pieceId: piece.id, user: seed.users.store, idempotencyKey: 'reg-1', event: { type: 'STAGE_QA_PASSED', stage: 'cutting' } }),
    ).rejects.toMatchObject({ status: 422, code: 'invalid_transition' })
    expect(await testPrisma.pieceEvent.count({ where: { pieceId: piece.id } })).toBe(0)
    expect((await testPrisma.piece.findUniqueOrThrow({ where: { id: piece.id } })).version).toBe(0)
  })

  it('replay by idempotency key returns the original event and appends nothing', async () => {
    const piece = seed.pieces[0]!
    const args = { pieceId: piece.id, user: seed.users.admin, idempotencyKey: 'reg-2', event: { type: 'PIECE_CANCELLED' as const } }
    const first = await runPieceAction(args)
    const second = await runPieceAction(args)
    expect(second.replayed).toBe(true)
    expect(second.event.id).toBe(first.event.id)
    expect(await testPrisma.pieceEvent.count({ where: { pieceId: piece.id } })).toBe(1)
  })

  it('loadPieceView still reports the seeded context the scan screen shows', async () => {
    const v = await loadPieceView({ qrToken: seed.pieces[0]!.qrToken })
    expect(v).toMatchObject({
      state: 'PLANNED', serial: 1, styleCode: 'LJ-204', size: 'M', shade: 'BLK-02',
      orderNumber: 'PO-4471', programName: 'Autumn 26', buyerName: 'Nordheim GmbH',
      actions: ['activate', 'cancel'], labelStage: null, worker: null, lastEvent: null, version: 0,
    })
  })
})

describe('checkpoint regression: formatters the labels and pills depend on', () => {
  it('CUT OK stays shouted, serials stay four wide', () => {
    expect(formatState('CUT_OK')).toBe('Cut OK')
    expect(formatState('CUT_PENDING_QA')).toBe('Cut pending QA')
    expect(formatEventType('LABEL_PRINT_REQUESTED')).toBe('Label print requested')
    expect(formatSerial(7)).toBe('0007')
  })

  it('@hf/server/format never imports the database, so client components can use it', () => {
    const src = readFileSync(resolve(__dirname, '../../../../packages/server/src/format.ts'), 'utf8')
    expect(src).not.toMatch(/@hf\/db|\.\/piece-|\.\/api|\.\/storage|prisma/)
  })
})

describe('checkpoint regression: seed', () => {
  beforeEach(resetTestDb)
  it('keeps the four floor users the e2e suite signs in as, plus the two office users', async () => {
    const r = await seedAll(testPrisma)
    expect(Object.keys(r.users).sort()).toEqual(['admin', 'management', 'merchandiser', 'qa', 'store', 'supervisor'])
    for (const u of Object.values(r.users)) expect(u.authIdentity).toBe(`dev:${u.role}`)
    expect(r.pieces).toHaveLength(65)
  })
})
