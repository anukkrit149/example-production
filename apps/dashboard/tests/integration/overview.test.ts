import { beforeEach, describe, expect, it, vi } from 'vitest'
import { testPrisma } from '@hf/db/test'
import type { SeedResult } from '@hf/db'
import { getOverview, listActivity, runPieceAction, type ActivityPage, type Overview } from '@hf/server'
import { as, freshSeed, nextHeadersMock, authServerMock, packPiece, params, read, signedOut } from './helpers'

vi.mock('next/headers', () => nextHeadersMock())
vi.mock('@/lib/auth-server', () => authServerMock())

const route = await import('@/app/api/overview/route')
const get = (qs = '') => route.GET(new Request(`http://x/api/overview${qs}`), params())

let seed: SeedResult

const photo = async () =>
  (await testPrisma.attachment.create({ data: { storageKey: `t/${crypto.randomUUID()}.jpg`, mime: 'image/jpeg', bytes: 1, takenById: seed.users.store.id } })).id

/** Activate a seeded piece at cutting — the first real event in a piece's life. */
const activate = async (i: number) =>
  runPieceAction({
    pieceId: seed.pieces[i]!.id, user: seed.users.store, idempotencyKey: `ov-act-${i}`,
    event: { type: 'PIECE_ACTIVATED', stage: 'cutting' }, attachmentIds: [await photo()],
  })

/**
 * Take a piece to `CUT_OK` and reprint its cutting label.
 *
 * Passing cut QA already emits a `LABEL_PRINT_REQUESTED` of its own — that
 * automatic event is exactly why the feed drowns in label rows — so this adds
 * only the reprint, and the piece ends up with one of each.
 */
const labelPrints = async (i: number) => {
  const pieceId = seed.pieces[i]!.id
  await runPieceAction({ pieceId, user: seed.users.store, idempotencyKey: `lbl-act-${i}`, event: { type: 'PIECE_ACTIVATED', stage: 'cutting' }, attachmentIds: [await photo()] })
  await runPieceAction({ pieceId, user: seed.users.qa, idempotencyKey: `lbl-qa-${i}`, event: { type: 'STAGE_QA_PASSED', stage: 'cutting' }, attachmentIds: [await photo()] })
  await runPieceAction({ pieceId, user: seed.users.store, idempotencyKey: `lbl-reprint-${i}`, event: { type: 'LABEL_REPRINT_REQUESTED', stage: 'cutting' } })
}

describe('factory overview', () => {
  beforeEach(async () => { seed = await freshSeed() })

  it('counts the day\'s work, the live floor and the order book', async () => {
    await activate(0)
    await activate(1)
    await activate(2)
    await packPiece(seed, 10, 'CTN-1')

    const o = await getOverview({ period: 'today' })

    expect(o.period.kind).toBe('today')
    expect(o.numbers.cut).toBe(4)          // three activations plus the packed piece's own
    expect(o.numbers.packed).toBe(1)
    expect(o.numbers.shipped).toBe(0)
    expect(o.numbers.events).toBeGreaterThan(0)

    // 65 seeded pieces; three are at CUT_PENDING_QA and one is PACKED.
    expect(o.rightNow.planned).toBe(61)
    expect(o.rightNow.counts.cutting).toBeGreaterThanOrEqual(1)
    expect(o.rightNow.counts.packaging).toBe(1)
    expect(o.rightNow.ordered).toBe(65)

    const sum = (key: string) => o.throughput.stages.find((s) => s.key === key)!.values.reduce((a, b) => a + b, 0)
    expect(o.throughput.stages.map((s) => s.key)).toEqual(['cutting', 'pasting', 'stitching', 'finishing', 'qc', 'packaging'])
    for (const s of o.throughput.stages) expect(s.values).toHaveLength(o.period.buckets.length)
    // Cutting is the activations only: its QA pass must not double-count the piece.
    expect(sum('cutting')).toBe(4)
    expect(sum('pasting')).toBe(1)
    expect(sum('qc')).toBe(1)
    expect(sum('packaging')).toBe(1)

    expect(o.dailyRate).toBeGreaterThan(0)
    const risk = o.ordersAtRisk[0]!
    expect(risk.orderNumber).toBe('PO-4471')
    expect(risk.packed).toBe(1)
    expect(risk.ordered).toBe(65)
    expect(risk.projectedFinish).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(risk.dailyRate).toBeGreaterThan(0)
    expect(risk.percent).toBe(2)

    // The plan curve ends on the due date and never promises more than is ordered.
    expect(o.cumulative.ordered).toBe(65)
    expect(o.cumulative.days.at(-1)).toBe('2030-06-01')
    expect(o.cumulative.packed).toHaveLength(o.cumulative.days.length)
    expect(o.cumulative.projection).toHaveLength(o.cumulative.days.length)
    // Packed-to-date is cumulative, so it only ever climbs.
    expect([...o.cumulative.packed].sort((a, b) => a - b)).toEqual(o.cumulative.packed)
    expect(o.cumulative.packed.at(-1)).toBe(1)
    expect(Math.max(...o.cumulative.projection.map((p) => p ?? 0))).toBeLessThanOrEqual(65)
  })

  it('a QA failure lands in the numbers, the per-stage split and the rate', async () => {
    await activate(0)
    await runPieceAction({
      pieceId: seed.pieces[0]!.id, user: seed.users.qa, idempotencyKey: 'ov-fail',
      event: { type: 'STAGE_QA_FAILED', stage: 'cutting' }, attachmentIds: [await photo()],
    })
    await activate(1)
    await runPieceAction({
      pieceId: seed.pieces[1]!.id, user: seed.users.qa, idempotencyKey: 'ov-pass',
      event: { type: 'STAGE_QA_PASSED', stage: 'cutting' }, attachmentIds: [await photo()],
    })

    const o = await getOverview({ period: 'today' })
    expect(o.numbers.qaFailed).toBe(1)
    expect(o.numbers.qaRate).toBeCloseTo(1 / 2)
    expect(o.qa.find((r) => r.stage === 'cutting')).toEqual({ stage: 'cutting', passed: 1, failed: 1 })
    expect(o.qa.map((r) => r.stage)).toEqual(['cutting', 'pasting', 'stitching', 'finishing', 'qc'])
    expect(o.qa.find((r) => r.stage === 'qc')).toEqual({ stage: 'qc', passed: 0, failed: 0 })
  })

  it('with nobody working, the QA rate is null and no worker is listed', async () => {
    const o = await getOverview({ period: 'today' })
    expect(o.numbers.qaRate).toBeNull()
    expect(o.numbers.activeWorkers).toBe(0)
    expect(o.workers).toEqual([])
    expect(o.numbers.events).toBe(0)
  })

  it('names the workers who handled pieces and counts them once each', async () => {
    const w = seed.workers[1]!
    await activate(0)
    await runPieceAction({
      pieceId: seed.pieces[0]!.id, user: seed.users.qa, idempotencyKey: 'ov-w-qa',
      event: { type: 'STAGE_QA_PASSED', stage: 'cutting' }, attachmentIds: [await photo()],
    })
    await runPieceAction({
      pieceId: seed.pieces[0]!.id, user: seed.users.store, idempotencyKey: 'ov-w-iss',
      event: { type: 'ISSUED', stage: 'pasting' }, workerId: w.id, afterWorker: w.id, attachmentIds: [await photo()],
    })

    const o = await getOverview({ period: 'today' })
    expect(o.workers[0]).toMatchObject({ workerId: w.id, name: w.name, type: w.type })
    expect(o.workers[0]!.pieces).toBeGreaterThanOrEqual(1)
    expect(o.numbers.activeWorkers).toBe(1)
    expect(o.rightNow.withWorkers).toBe(1)
  })

  it('the live WIP tallies follow the piece states they are derived from', async () => {
    const empty = await getOverview({ period: 'today' })
    expect(empty.rightNow).toMatchObject({ withWorkers: 0, awaitingQa: 0, onHold: 0 })

    // Two cuts sit at CUT_PENDING_QA: awaiting a checker, nobody holding them.
    await activate(0)
    await activate(1)
    let o = await getOverview({ period: 'today' })
    expect(o.rightNow.awaitingQa).toBe(2)
    expect(o.rightNow.withWorkers).toBe(0)

    // Passing one and issuing it moves it from the QA queue into a worker's hands.
    await runPieceAction({
      pieceId: seed.pieces[0]!.id, user: seed.users.qa, idempotencyKey: 'ov-wip-qa',
      event: { type: 'STAGE_QA_PASSED', stage: 'cutting' }, attachmentIds: [await photo()],
    })
    const w = seed.workers[1]!
    await runPieceAction({
      pieceId: seed.pieces[0]!.id, user: seed.users.store, idempotencyKey: 'ov-wip-iss',
      event: { type: 'ISSUED', stage: 'pasting' }, workerId: w.id, afterWorker: w.id, attachmentIds: [await photo()],
    })
    o = await getOverview({ period: 'today' })
    expect(o.rightNow).toMatchObject({ awaitingQa: 1, withWorkers: 1, onHold: 0 })

    // Holding the other empties the QA queue and fills the hold count.
    await runPieceAction({
      pieceId: seed.pieces[1]!.id, user: seed.users.supervisor, idempotencyKey: 'ov-wip-hold',
      event: { type: 'PIECE_HELD' }, details: { reason: 'shade mismatch' }, attachmentIds: [await photo()],
    })
    o = await getOverview({ period: 'today' })
    expect(o.rightNow).toMatchObject({ awaitingQa: 0, withWorkers: 1, onHold: 1 })
    expect(o.rightNow.counts.onHold).toBe(1)
    expect(o.numbers.held).toBe(1)
  })

  it('the period the caller asks for is the period it aggregates over', async () => {
    await activate(0)
    // A day in the past holds none of today's work.
    const past = await getOverview({ period: 'day', date: '2026-01-01' })
    expect(past.period.date).toBe('2026-01-01')
    expect(past.period.buckets).toHaveLength(24)
    expect(past.numbers.cut).toBe(0)
    // The live windows all contain it.
    for (const period of ['today', 'week', '7d'] as const) {
      expect((await getOverview({ period })).numbers.cut).toBe(1)
    }
    expect((await getOverview({ period: '7d' })).period.buckets).toHaveLength(7)
  })
})

describe('activity feed', () => {
  beforeEach(async () => { seed = await freshSeed() })

  it('is newest first, carries the piece and its order, and stops when the page fits', async () => {
    await packPiece(seed, 0, 'CTN-1')
    const page = await listActivity({})
    expect(page.rows[0]!.eventType).toBe('PACKED')
    expect(page.rows[0]!.orderNumber).toBe('PO-4471')
    expect(page.rows[0]!.styleCode).toBe('LJ-204')
    expect(page.rows[0]!.serial).toBe(1)
    expect(page.rows[0]!.user).toBe(seed.users.store.name)
    expect(page.nextBefore).toBeNull()
    // Descending by time.
    const times = page.rows.map((r) => Date.parse(r.at))
    expect([...times].sort((a, b) => b - a)).toEqual(times)
    // The filter dropdowns ride along with the page.
    expect(page.orders.map((o) => o.orderNumber)).toEqual(['PO-4471'])
    expect(page.workers.map((w) => w.name)).toContain(seed.workers[1]!.name)
  })

  it('filters by event type and by worker', async () => {
    await packPiece(seed, 0, 'CTN-1')
    const packed = await listActivity({ eventType: 'PACKED' })
    expect(packed.rows).toHaveLength(1)
    expect(packed.rows.every((r) => r.eventType === 'PACKED')).toBe(true)

    const w = seed.workers[1]!
    const byWorker = await listActivity({ workerId: w.id })
    expect(byWorker.rows.length).toBeGreaterThan(0)
    expect(byWorker.rows.every((r) => r.worker === w.name)).toBe(true)

    // A filter value nobody typed correctly narrows nothing rather than throwing.
    expect((await listActivity({ eventType: 'NOT_A_REAL_EVENT' })).rows.length).toBeGreaterThan(1)
  })

  it('pages backwards on the cursor without repeating a row', async () => {
    await packPiece(seed, 0, 'CTN-1')
    const first = await listActivity({ limit: 1 })
    expect(first.rows).toHaveLength(1)
    expect(first.nextBefore).toBe(`${first.rows[0]!.at}|${first.rows[0]!.id}`)

    const second = await listActivity({ limit: 1, before: first.nextBefore! })
    expect(second.rows).toHaveLength(1)
    expect(second.rows[0]!.id).not.toBe(first.rows[0]!.id)
    expect(Date.parse(second.rows[0]!.at)).toBeLessThanOrEqual(Date.parse(first.rows[0]!.at))
  })

  it('pages through rows that share a timestamp without skipping or repeating one', async () => {
    // `createdAt` has millisecond resolution and nothing makes it unique, so two
    // events can and do land on the same instant — two checkers passing QA at
    // once, a bulk action, or simply a fast machine. A cursor keyed on the
    // timestamp alone steps straight over every row after the first of a tie.
    // The tie is forced here rather than raced for, so the test cannot flake.
    await activate(0)
    await runPieceAction({
      pieceId: seed.pieces[0]!.id, user: seed.users.qa, idempotencyKey: 'ov-cursor-qa',
      event: { type: 'STAGE_QA_PASSED', stage: 'cutting' }, attachmentIds: [await photo()],
    })
    const [oldest, ...rest] = await testPrisma.pieceEvent.findMany({ orderBy: { createdAt: 'asc' }, select: { id: true, createdAt: true } })
    await testPrisma.pieceEvent.updateMany({ where: { id: { in: rest.map((r) => r.id) } }, data: { createdAt: oldest!.createdAt } })

    const all = await listActivity({ limit: 100 })
    const times = all.rows.map((r) => r.at)
    expect(all.rows.length).toBeGreaterThan(1)
    expect(new Set(times).size).toBe(1) // every row shares one instant

    const paged: string[] = []
    let before: string | null = null
    for (let guard = 0; guard <= all.rows.length; guard++) {
      const page = await listActivity({ limit: 1, ...(before ? { before } : {}) })
      paged.push(...page.rows.map((r) => r.id))
      before = page.nextBefore
      if (!before) break
    }
    expect(paged).toEqual(all.rows.map((r) => r.id))
    expect(new Set(paged).size).toBe(paged.length)
  })

  it('an order filter keeps only that order\'s events', async () => {
    await packPiece(seed, 0, 'CTN-1')
    const order = await testPrisma.order.findFirstOrThrow()
    expect((await listActivity({ orderId: order.id })).rows.length).toBeGreaterThan(0)
    expect(await listActivity({ orderId: '00000000-0000-4000-8000-000000000000' })).toMatchObject({ rows: [], nextBefore: null })
  })

  // Every piece asks for a cutting label the moment it passes cut QA, so on a
  // real floor label prints outnumber everything else and bury the work the
  // feed is there to show. They are hidden unless the reader asks (D5).
  it('hides label prints by default and shows them on request', async () => {
    await labelPrints(0)

    const hidden = await listActivity({ limit: 100 })
    expect(hidden.rows.some((r) => r.eventType === 'LABEL_PRINT_REQUESTED')).toBe(false)
    expect(hidden.rows.some((r) => r.eventType === 'LABEL_REPRINT_REQUESTED')).toBe(false)
    expect(hidden.rows.length).toBeGreaterThan(0)

    const shown = await listActivity({ limit: 100, includeLabelEvents: true })
    expect(shown.rows.some((r) => r.eventType === 'LABEL_PRINT_REQUESTED')).toBe(true)
    expect(shown.rows.some((r) => r.eventType === 'LABEL_REPRINT_REQUESTED')).toBe(true)
    expect(shown.rows.length).toBe(hidden.rows.length + 2)
  })

  // Hiding is a filter like any other: it composes with the cursor rather than
  // leaving a hole in a page, so paging the default feed never lands on one.
  it('pages the hidden feed without a gap where a label print was', async () => {
    await labelPrints(0)
    const all = await listActivity({ limit: 100 })

    const paged: string[] = []
    let before: string | null = null
    for (let i = 0; i < all.rows.length + 2; i++) {
      const page: ActivityPage = await listActivity({ limit: 1, ...(before ? { before } : {}) })
      if (page.rows.length === 0) break
      paged.push(page.rows[0]!.id)
      before = page.nextBefore
      if (!before) break
    }
    expect(paged).toEqual(all.rows.map((r) => r.id))
  })

  // An explicit `eventType=LABEL_PRINT_REQUESTED` is the reader asking for
  // exactly those rows; the default hiding must not silently answer "none".
  it('an explicit label event type filter finds them without the flag', async () => {
    await labelPrints(0)
    const only = await listActivity({ eventType: 'LABEL_PRINT_REQUESTED' })
    expect(only.rows).toHaveLength(1)
    expect(only.rows[0]!.eventType).toBe('LABEL_PRINT_REQUESTED')
  })
})

describe('GET /api/overview', () => {
  beforeEach(async () => { seed = await freshSeed() })

  it('needs a signed-in user', async () => {
    signedOut()
    expect((await get()).status).toBe(401)
  })

  it('answers a merchandiser with today by default', async () => {
    as(seed.users.merchandiser)
    const res = await get()
    expect(res.status).toBe(200)
    const body = await read<Overview>(res)
    expect(body.period.kind).toBe('today')
    expect(typeof body.asOf).toBe('string')
    expect(body.rightNow.counts.total).toBe(65)
  })

  it('passes the period and date through from the query string', async () => {
    as(seed.users.merchandiser)
    const body = await read<Overview>(await get('?period=day&date=2026-01-01'))
    expect(body.period.kind).toBe('day')
    expect(body.period.date).toBe('2026-01-01')
    // A period nobody meant falls back rather than erroring.
    expect((await read<Overview>(await get('?period=nonsense'))).period.kind).toBe('today')
  })

  it('an order that has packed nothing has no projection: the rate is its own, not the floor\'s', async () => {
    const o = await getOverview({ period: '7d' })
    const risk = o.ordersAtRisk.find((r) => r.orderNumber === 'PO-4471')!
    expect(risk.packed).toBe(0)
    expect(risk.dailyRate).toBe(0)
    expect(risk.projectedFinish).toBeNull()
    expect(o.dailyRate).toBe(0)
  })
})
