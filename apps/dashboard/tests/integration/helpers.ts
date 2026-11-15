import { resetTestDb, testPrisma } from '@hf/db/test'
import { seedAll, type SeedResult } from '@hf/db'
import { runPieceAction } from '@hf/server'

/**
 * One mutable identity every test swaps between roles. The test file mocks
 * `next/headers` to read it (vi.mock must sit in the test file itself — it is
 * hoisted per module), and `@/lib/auth` reads the cookie through that mock.
 */
export const cookie = { value: '' }
export const nextHeadersMock = () => ({
  cookies: async () => ({ get: (n: string) => (n === 'hf_dev_user' && cookie.value ? { value: cookie.value } : undefined) }),
})
export const authServerMock = () => ({ auth: { getSession: async () => ({ data: null }) } })

export async function freshSeed(): Promise<SeedResult> {
  await resetTestDb()
  const seed = await seedAll(testPrisma)
  process.env.DEV_AUTH = 'true'
  delete process.env.NEON_AUTH_BASE_URL
  cookie.value = ''
  return seed
}

export const as = (u: { authIdentity: string }) => { cookie.value = u.authIdentity }
export const signedOut = () => { cookie.value = '' }

export const post = (body: unknown, key = crypto.randomUUID()) =>
  new Request('http://x', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json', 'idempotency-key': key } })
export const patch = (body: unknown) =>
  new Request('http://x', { method: 'PATCH', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } })
export const params = (p: Record<string, string> = {}) => ({ params: Promise.resolve(p) })

/** Parse and return the JSON body; on a non-2xx the `error` object is what you get. */
export const read = async <T = Record<string, unknown>>(res: Response): Promise<T> => (await res.json()) as T

const photoFor = async (seed: SeedResult) =>
  (await testPrisma.attachment.create({ data: { storageKey: `t/${crypto.randomUUID()}.jpg`, mime: 'image/jpeg', bytes: 1, takenById: seed.users.store.id } })).id

/** Walk a seeded piece to QC_OK, then pack it into `carton`. */
export async function packPiece(seed: SeedResult, i: number, carton: string) {
  const p = seed.pieces[i]!
  const w = seed.workers[1]!
  const k = (s: string) => `${s}-${i}`
  await runPieceAction({ pieceId: p.id, user: seed.users.store, idempotencyKey: k('act'), event: { type: 'PIECE_ACTIVATED', stage: 'cutting' }, attachmentIds: [await photoFor(seed)] })
  await runPieceAction({ pieceId: p.id, user: seed.users.qa, idempotencyKey: k('qa-cut'), event: { type: 'STAGE_QA_PASSED', stage: 'cutting' }, attachmentIds: [await photoFor(seed)] })
  for (const stage of ['pasting', 'stitching', 'finishing'] as const) {
    await runPieceAction({ pieceId: p.id, user: seed.users.store, idempotencyKey: k(`iss-${stage}`), event: { type: 'ISSUED', stage }, workerId: w.id, afterWorker: w.id, attachmentIds: [await photoFor(seed)] })
    await runPieceAction({ pieceId: p.id, user: seed.users.store, idempotencyKey: k(`rec-${stage}`), event: { type: 'RECEIVED', stage }, workerId: w.id, afterWorker: null, attachmentIds: [await photoFor(seed)] })
    await runPieceAction({ pieceId: p.id, user: seed.users.qa, idempotencyKey: k(`qa-${stage}`), event: { type: 'STAGE_QA_PASSED', stage }, attachmentIds: [await photoFor(seed)] })
  }
  await runPieceAction({ pieceId: p.id, user: seed.users.qa, idempotencyKey: k('qc'), event: { type: 'STAGE_QA_PASSED', stage: 'qc' }, attachmentIds: [await photoFor(seed)] })
  await runPieceAction({ pieceId: p.id, user: seed.users.store, idempotencyKey: k('pack'), event: { type: 'PACKED' }, details: { carton }, attachmentIds: [await photoFor(seed)] })
  return p
}
