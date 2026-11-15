import { prisma, type Prisma } from '@hf/db'
import { PIECE_EVENT_TYPES, STAGES, stageCountsFromRows, type PieceEventType, type PieceState, type Stage, type StageCounts } from '@hf/domain'
import { listOrders } from './commercial/orders'

/**
 * Every number on the overview is read in Asia/Kolkata, which has no DST and a
 * fixed +05:30 offset — so a day boundary is plain arithmetic on epoch
 * milliseconds rather than a timezone database lookup. Shifting a UTC instant
 * forward by the offset makes "the Kolkata wall clock" and "UTC" the same
 * calendar, which is why every label below reads its parts with getUTC*.
 */
const IST = 330 * 60_000
const DAY = 86_400_000
const HOUR = 3_600_000

export const kolkataDayStart = (t: Date) => new Date(Math.floor((t.getTime() + IST) / DAY) * DAY - IST)
export const kolkataDate = (t: Date) => new Date(t.getTime() + IST).toISOString().slice(0, 10)

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const dayLabel = (start: Date) => {
  const k = new Date(start.getTime() + IST)
  return `${DOW[k.getUTCDay()]} ${k.getUTCDate()} ${MON[k.getUTCMonth()]}`
}
const hourLabel = (start: Date) => new Date(start.getTime() + IST).toISOString().slice(11, 16)

/** Monday is the first day of a factory week. */
const kolkataWeekStart = (t: Date) => {
  const d = kolkataDayStart(t)
  const dow = new Date(d.getTime() + IST).getUTCDay()
  return new Date(d.getTime() - ((dow + 6) % 7) * DAY)
}

/** A real Kolkata calendar date, rejecting both malformed text and "2026-02-31". */
const isDate = (s: string | undefined): s is string =>
  !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00+05:30`)) && kolkataDate(new Date(`${s}T00:00:00+05:30`)) === s

export type PeriodKind = 'today' | 'week' | '7d' | 'day'
export type Bucket = { start: string; end: string; label: string }
/**
 * `label` names the period ("This week"); `rangeLabel` also says which days
 * that is ("This week · Mon 31 Aug – Sun 6 Sep"), because "this week" alone
 * left readers guessing where the window started. `today` is the Kolkata
 * calendar date the request resolved against — the day picker bounds itself by
 * it, and a browser in another timezone must not compute its own.
 */
export type OverviewPeriod = {
  kind: PeriodKind; from: string; to: string; date: string | null; buckets: Bucket[]
  label: string; rangeLabel: string; today: string
}

function buckets(from: Date, to: Date, step: 'hour' | 'day'): Bucket[] {
  const out: Bucket[] = []
  const size = step === 'hour' ? HOUR : DAY
  for (let s = from.getTime(); s < to.getTime(); s += size) {
    const start = new Date(s)
    const end = new Date(Math.min(s + size, to.getTime()))
    out.push({ start: start.toISOString(), end: end.toISOString(), label: step === 'hour' ? hourLabel(start) : dayLabel(start) })
  }
  return out
}

/**
 * The window a request asks for, in Kolkata terms.
 *
 * `to` is where *counting* stops (now, for the live periods) while the bucket
 * list runs to the end of the current hour or day — so the bar a reader is
 * watching fill up is on screen from its first minute instead of appearing an
 * hour late. Anything unrecognised falls back to today rather than erroring:
 * this is a read-only dashboard reached from a URL people edit by hand.
 */
export function resolvePeriod(q: { period?: string; date?: string }, now = new Date()): OverviewPeriod {
  const today = kolkataDayStart(now)
  const todayDate = kolkataDate(now)

  // A multi-day window is captioned by the days it actually covers, which ends
  // at today rather than at the bucket list's end-of-today: a reader asking
  // "this week" on Monday morning should be told "Mon 31 Aug – Mon 31 Aug",
  // not shown a range running to a tomorrow nothing has happened in yet.
  const spanning = (name: string, from: Date) => `${name} · ${dayLabel(from)} – ${dayLabel(today)}`

  if (q.period === 'day' && isDate(q.date)) {
    const from = new Date(`${q.date}T00:00:00+05:30`)
    const to = new Date(from.getTime() + DAY)
    // A chosen day names itself; prefixing it with a period name would say the
    // same thing twice.
    const label = dayLabel(from)
    return { kind: 'day', from: from.toISOString(), to: to.toISOString(), date: q.date, buckets: buckets(from, to, 'hour'), label, rangeLabel: label, today: todayDate }
  }

  const endOfToday = new Date(today.getTime() + DAY)
  if (q.period === 'week') {
    const from = kolkataWeekStart(now)
    return { kind: 'week', from: from.toISOString(), to: now.toISOString(), date: null, buckets: buckets(from, endOfToday, 'day'), label: 'This week', rangeLabel: spanning('This week', from), today: todayDate }
  }
  if (q.period === '7d') {
    const from = new Date(today.getTime() - 6 * DAY)
    return { kind: '7d', from: from.toISOString(), to: now.toISOString(), date: null, buckets: buckets(from, endOfToday, 'day'), label: 'Last 7 days', rangeLabel: spanning('Last 7 days', from), today: todayDate }
  }

  // The end of the Kolkata hour `now` is in — floor to the hour, then add one.
  //
  // The grid has to be the Kolkata one, not the UTC one: +05:30 is not a whole
  // number of hours, so a UTC-grid ceil sits half an hour out and for the back
  // half of every hour appends a bucket for a Kolkata hour that has not started.
  // Flooring rather than ceiling is what keeps the hour on the hour: at exactly
  // 02:00 a ceil is a no-op and would drop the 02:00 bucket a reader is watching.
  const nextHour = new Date((Math.floor((now.getTime() + IST) / HOUR) + 1) * HOUR - IST)
  return { kind: 'today', from: today.toISOString(), to: now.toISOString(), date: null, buckets: buckets(today, nextHour, 'hour'), label: 'Today', rangeLabel: `Today · ${dayLabel(today)}`, today: todayDate }
}

/** The Kolkata date the remainder runs out on at the current rate, or null when nothing is moving. */
export function projectFinish(remaining: number, dailyRate: number, now: Date): string | null {
  if (dailyRate <= 0) return null
  const days = Math.max(0, Math.ceil(remaining / dailyRate))
  return kolkataDate(new Date(kolkataDayStart(now).getTime() + days * DAY))
}

export type PeriodNumbers = {
  cut: number; pasted: number; stitched: number; finished: number; qcPassed: number; packed: number; shipped: number
  qaFailed: number
  /** failed / (passed + failed) over the window, or null when nobody checked anything. */
  qaRate: number | null
  held: number; activeWorkers: number; events: number
}

export type ThroughputStageKey = 'cutting' | 'pasting' | 'stitching' | 'finishing' | 'qc' | 'packaging'
export type ThroughputSeries = { stages: Array<{ key: ThroughputStageKey; values: number[] }> }
export type WorkerLoad = { workerId: string; name: string; type: string; pieces: number }
export type QaByStage = Array<{ stage: string; passed: number; failed: number }>
export type OrderRisk = {
  id: string; orderNumber: string; programName: string; dueDate: string
  ordered: number; packed: number; percent: number; daysLeft: number
  /** This order's own packing rate, pieces per day (one decimal), over the period or its last 7 days. */
  dailyRate: number
  projectedFinish: string | null; late: boolean
}
export type Cumulative = { days: string[]; packed: number[]; ordered: number; projection: Array<number | null> }
export type RightNow = { counts: StageCounts; ordered: number; withWorkers: number; awaitingQa: number; onHold: number; planned: number }
export type Overview = {
  asOf: string; period: OverviewPeriod; numbers: PeriodNumbers; throughput: ThroughputSeries
  workers: WorkerLoad[]; qa: QaByStage; rightNow: RightNow; ordersAtRisk: OrderRisk[]
  cumulative: Cumulative; dailyRate: number
}

/** The stages a QA checker passes or fails; packaging has no QA step. */
const QA_STAGES = STAGES.filter((s) => s !== 'packaging')
/** A piece in a worker's hands, and one sitting in the store room waiting for a checker. */
const WITH_WORKER_STATES: readonly PieceState[] = ['WITH_PASTING', 'WITH_STITCHING', 'WITH_FINISHING']
const PENDING_QA_STATES: readonly PieceState[] = ['CUT_PENDING_QA', 'PASTED_PENDING_QA', 'STITCHED_PENDING_QA', 'FINISHED_PENDING_QA']
/** An event by one of these is a worker doing something with a piece in hand. */
const WORKER_EVENTS: readonly PieceEventType[] = ['ISSUED', 'RECEIVED', 'STAGE_QA_PASSED']
const WORKERS_SHOWN = 15

type WindowEvent = { eventType: PieceEventType; stage: Stage | null; workerId: string | null; createdAt: Date }

const countWhere = (rows: WindowEvent[], type: PieceEventType, stage?: Stage) =>
  rows.filter((e) => e.eventType === type && (stage === undefined || e.stage === stage)).length

/**
 * Everything on the factory pulse, for one window.
 *
 * The window's events are fetched once and folded in JS rather than issued as a
 * dozen grouped counts: even a busy week is a few thousand rows, and one pass
 * over them gives the totals, the per-bucket series, the per-worker load and
 * the QA split without the read model drifting between them. Everything that
 * genuinely needs the database (the live piece states, the WIP views, the order
 * book) goes out alongside it in one round trip's worth of latency.
 */
export async function getOverview(q: { period?: string; date?: string }, now = new Date()): Promise<Overview> {
  const period = resolvePeriod(q, now)
  const from = new Date(period.from)
  const to = new Date(period.to)
  const today = kolkataDayStart(now)

  const [events, workerRows, stateRows, orders] = await Promise.all([
    prisma.pieceEvent.findMany({
      where: { createdAt: { gte: from, lt: to } },
      select: { eventType: true, stage: true, workerId: true, createdAt: true },
    }),
    prisma.worker.findMany({ where: { active: true }, select: { id: true, name: true, type: true } }),
    prisma.piece.groupBy({ by: ['state'], _count: { _all: true } }),
    listOrders(),
  ])

  const numbers = periodNumbers(events)
  const throughput = throughputSeries(events, period.buckets)
  const qa = qaByStage(events)
  const workers = workerLoad(events, workerRows)

  // The three WIP tallies come from this same grouped count rather than from
  // wip.ts's `withWorkers()` / `awaitingQa()` / `onHold()`. Those build fully
  // joined piece lists for a screen that shows the rows, and they cap at
  // PIECE_LIST_CAP — so on a big floor they would quietly under-report a number
  // that is supposed to be a total, at the cost of three joined scans to
  // produce three integers. `piece.state` is the same source of truth either way.
  const byState = new Map(stateRows.map((r) => [r.state as PieceState, r._count._all]))
  const sumStates = (states: readonly PieceState[]) => states.reduce((n, s) => n + (byState.get(s) ?? 0), 0)
  const counts = stageCountsFromRows([...byState].map(([state, count]) => ({ state, count })))
  const rightNow: RightNow = {
    counts,
    // Everything the factory still owes: a cancelled piece is off the book.
    ordered: counts.total - counts.cancelled,
    withWorkers: sumStates(WITH_WORKER_STATES),
    awaitingQa: sumStates(PENDING_QA_STATES),
    onHold: counts.onHold,
    planned: counts.planned,
  }

  const open: OpenOrder[] = orders.flatMap((o) => (o.dueDate !== null && o.progress.status !== 'complete' ? [{ ...o, dueDate: o.dueDate }] : []))
  const packedEvents = await packedEventsFor(open)

  // Rates are pieces packed per day: over the selected period when it saw any
  // packing, otherwise over the last seven days. Each open order gets its own
  // rate, so a floor split across three orders projects each at a third of the
  // pace rather than promising all three the whole floor. The factory-wide
  // rate drives only the aggregate curve.
  const periodDays = Math.max(1, (to.getTime() - from.getTime()) / DAY)
  const weekAgo = new Date(today.getTime() - 6 * DAY)
  const rateOf = (rows: PackedEvent[]) => {
    const inPeriod = rows.filter((e) => e.createdAt >= from && e.createdAt < to).length
    if (inPeriod > 0) return inPeriod / periodDays
    return rows.filter((e) => e.createdAt >= weekAgo && e.createdAt < now).length / 7
  }
  const dailyRate = rateOf(packedEvents)
  const byOrder = new Map<string, PackedEvent[]>()
  for (const e of packedEvents) byOrder.set(e.orderId, [...(byOrder.get(e.orderId) ?? []), e])
  const rateFor = (orderId: string) => rateOf(byOrder.get(orderId) ?? [])

  const ordersAtRisk = riskRows(open, rateFor, today, now)
  const cumulative = cumulativeCurve(open, packedEvents, dailyRate, today, now)

  return { asOf: now.toISOString(), period, numbers, throughput, workers, qa, rightNow, ordersAtRisk, cumulative, dailyRate }
}

function periodNumbers(events: WindowEvent[]): PeriodNumbers {
  const passed = countWhere(events, 'STAGE_QA_PASSED')
  const qaFailed = countWhere(events, 'STAGE_QA_FAILED')
  const activeWorkers = new Set(events.filter((e) => e.workerId && WORKER_EVENTS.includes(e.eventType)).map((e) => e.workerId))
  return {
    cut: countWhere(events, 'PIECE_ACTIVATED'),
    pasted: countWhere(events, 'STAGE_QA_PASSED', 'pasting'),
    stitched: countWhere(events, 'STAGE_QA_PASSED', 'stitching'),
    finished: countWhere(events, 'STAGE_QA_PASSED', 'finishing'),
    qcPassed: countWhere(events, 'STAGE_QA_PASSED', 'qc'),
    packed: countWhere(events, 'PACKED'),
    shipped: countWhere(events, 'SHIPPED'),
    qaFailed,
    qaRate: passed + qaFailed === 0 ? null : qaFailed / (passed + qaFailed),
    held: countWhere(events, 'PIECE_HELD'),
    activeWorkers: activeWorkers.size,
    events: events.length,
  }
}

/**
 * A stage's line across the buckets a reader sees.
 *
 * Cutting counts activations — the moment a piece exists on the floor at all,
 * which is what "pieces cut today" means — and packaging counts PACKED. The
 * four stages between count their QA pass, which is when the work is accepted
 * rather than merely handed back. Cutting's own QA pass is deliberately not
 * counted here: it would double-count every piece against its activation.
 */
function throughputSeries(events: WindowEvent[], list: Bucket[]): ThroughputSeries {
  // The buckets are uniform and contiguous, so an event's index is arithmetic
  // rather than a per-event scan of the list.
  //
  // `t >= lastEnd` returning -1 is unreachable for the events this is called
  // with, and must stay that way: the window query is half-open (`gte: from`,
  // `lt: to`) and every period's last bucket ends strictly after `to`, so no
  // fetched event can sit on or past that edge. Keep both halves of that pair —
  // an inclusive `lte: to` here would silently drop an event landing exactly on
  // `now` from the series while still counting it in `numbers`.
  const first = list.length ? Date.parse(list[0]!.start) : 0
  const lastEnd = list.length ? Date.parse(list[list.length - 1]!.end) : 0
  const size = list.length > 1 ? Date.parse(list[1]!.start) - first : lastEnd - first
  const bucketOf = (at: Date) => {
    const t = at.getTime()
    if (list.length === 0 || size <= 0 || t < first || t >= lastEnd) return -1
    return Math.min(list.length - 1, Math.floor((t - first) / size))
  }

  const series: Record<ThroughputStageKey, number[]> = {
    cutting: list.map(() => 0), pasting: list.map(() => 0), stitching: list.map(() => 0),
    finishing: list.map(() => 0), qc: list.map(() => 0), packaging: list.map(() => 0),
  }
  for (const e of events) {
    const key: ThroughputStageKey | null =
      e.eventType === 'PIECE_ACTIVATED' ? 'cutting'
        : e.eventType === 'PACKED' ? 'packaging'
          : e.eventType === 'STAGE_QA_PASSED' && e.stage && e.stage !== 'cutting' && e.stage !== 'packaging' ? e.stage
            : null
    if (!key) continue
    const i = bucketOf(e.createdAt)
    if (i >= 0) series[key][i]! += 1
  }
  return { stages: (['cutting', 'pasting', 'stitching', 'finishing', 'qc', 'packaging'] as const).map((key) => ({ key, values: series[key]! })) }
}

function qaByStage(events: WindowEvent[]): QaByStage {
  return QA_STAGES.map((stage) => ({
    stage,
    passed: countWhere(events, 'STAGE_QA_PASSED', stage),
    failed: countWhere(events, 'STAGE_QA_FAILED', stage),
  }))
}

/** Who touched the most pieces this window. Ties break by name so the order is stable. */
function workerLoad(events: WindowEvent[], workers: Array<{ id: string; name: string; type: string }>): WorkerLoad[] {
  const byId = new Map(workers.map((w) => [w.id, w]))
  const tally = new Map<string, number>()
  for (const e of events) {
    if (!e.workerId || !WORKER_EVENTS.includes(e.eventType)) continue
    tally.set(e.workerId, (tally.get(e.workerId) ?? 0) + 1)
  }
  return [...tally]
    .flatMap(([workerId, pieces]) => {
      const w = byId.get(workerId)
      return w ? [{ workerId, name: w.name, type: w.type, pieces }] : []
    })
    .sort((a, b) => b.pieces - a.pieces || a.name.localeCompare(b.name))
    .slice(0, WORKERS_SHOWN)
}

type OpenOrder = Awaited<ReturnType<typeof listOrders>>[number] & { dueDate: string }
type PackedEvent = { createdAt: Date; orderId: string }

/** Every PACKED event on the open orders' pieces, oldest first — one query feeds the risk rates and the cumulative curve. */
async function packedEventsFor(open: OpenOrder[]): Promise<PackedEvent[]> {
  if (open.length === 0) return []
  const rows = await prisma.pieceEvent.findMany({
    where: { eventType: 'PACKED', piece: { lineItem: { orderId: { in: open.map((o) => o.id) } } } },
    select: { createdAt: true, piece: { select: { lineItem: { select: { orderId: true } } } } },
    orderBy: { createdAt: 'asc' },
  })
  return rows.map((r) => ({ createdAt: r.createdAt, orderId: r.piece.lineItem.orderId }))
}

/**
 * Days a projected finish runs past a due date. An unknown finish — nothing is
 * moving at all — is the worst case there is, so it sorts above any real
 * overrun; a large finite number keeps `a - b` from becoming NaN when two rows
 * are both unknown.
 */
const NEVER = 1e9
const overrunDays = (projectedFinish: string | null, dueDate: string) =>
  projectedFinish === null ? NEVER : (Date.parse(`${projectedFinish}T00:00:00+05:30`) - Date.parse(`${dueDate}T00:00:00+05:30`)) / DAY

/**
 * The order book sorted by how much trouble it is in: the furthest a projected
 * finish runs past its due date comes first, then whatever is due soonest.
 */
function riskRows(open: OpenOrder[], rateFor: (orderId: string) => number, today: Date, now: Date): OrderRisk[] {
  return open
    .map((o) => {
      const packed = o.progress.counts.packaging
      const ordered = o.progress.ordered
      const dueStart = new Date(`${o.dueDate}T00:00:00+05:30`)
      const daysLeft = Math.floor((dueStart.getTime() - today.getTime()) / DAY)
      const dailyRate = rateFor(o.id)
      const projectedFinish = projectFinish(ordered - packed, dailyRate, now)
      return {
        id: o.id, orderNumber: o.orderNumber, programName: o.programName, dueDate: o.dueDate,
        ordered, packed,
        percent: ordered === 0 ? 0 : Math.round((100 * packed) / ordered),
        daysLeft,
        dailyRate: Math.round(dailyRate * 10) / 10,
        projectedFinish,
        late: daysLeft < 0 || (projectedFinish !== null && projectedFinish > o.dueDate),
      }
    })
    .sort((a, b) => overrunDays(b.projectedFinish, b.dueDate) - overrunDays(a.projectedFinish, a.dueDate) || a.daysLeft - b.daysLeft)
}

/**
 * Packed-to-date against the plan, day by day, with the rest of the curve
 * projected forward at the current rate.
 *
 * Fed the open orders' PACKED events; days run from the first of
 * them (or today, when nothing is packed) to the last due date. `projection` is
 * null for days already behind us — the actual line speaks for those.
 */
function cumulativeCurve(open: OpenOrder[], packedEvents: PackedEvent[], dailyRate: number, today: Date, now: Date): Cumulative {
  const ordered = open.reduce((n, o) => n + o.progress.ordered, 0)
  if (open.length === 0) return { days: [], packed: [], ordered, projection: [] }

  const firstDay = packedEvents[0] ? kolkataDayStart(packedEvents[0].createdAt) : today
  const lastDue = open.reduce((max, o) => (o.dueDate > max ? o.dueDate : max), kolkataDate(today))
  const lastDay = new Date(`${lastDue}T00:00:00+05:30`)

  const days: string[] = []
  for (let t = firstDay.getTime(); t <= lastDay.getTime(); t += DAY) days.push(kolkataDate(new Date(t)))

  const perDay = new Map<string, number>()
  for (const e of packedEvents) {
    const d = kolkataDate(e.createdAt)
    perDay.set(d, (perDay.get(d) ?? 0) + 1)
  }

  const todayDate = kolkataDate(now)
  const packed: number[] = []
  const projection: Array<number | null> = []
  let running = 0
  let packedToday = 0
  for (const d of days) {
    running += perDay.get(d) ?? 0
    packed.push(running)
    if (d === todayDate) packedToday = running
  }
  for (const d of days) {
    if (d < todayDate) { projection.push(null); continue }
    const daysAhead = Math.round((Date.parse(`${d}T00:00:00+05:30`) - Date.parse(`${todayDate}T00:00:00+05:30`)) / DAY)
    // The run-rate line starts wherever the real one has reached today, and
    // never promises more than the order book asks for.
    projection.push(Math.min(ordered, Math.round(packedToday + dailyRate * daysAhead)))
  }

  return { days, packed, ordered, projection }
}

export type ActivityRow = {
  id: string; at: string; eventType: string; stage: string | null; user: string; worker: string | null
  pieceId: string; serial: number; styleCode: string; orderId: string; orderNumber: string
}
export type ActivityQuery = {
  /** An opaque page cursor, `"<iso createdAt>|<row id>"` — pass a page's `nextBefore` back verbatim. */
  before?: string
  workerId?: string; orderId?: string; eventType?: string; limit?: number
  /**
   * Include the label-print rows the feed hides by default. Passing cut,
   * paste, stitch and finish QA each emits a `LABEL_PRINT_REQUESTED` of its
   * own, so on a working floor those rows outnumber every other event and
   * bury the work the feed exists to show (D5).
   */
  includeLabelEvents?: boolean
}
export type ActivityPage = {
  rows: ActivityRow[]
  /** The cursor for the next (older) page, or null on the last one. See `ActivityQuery.before`. */
  nextBefore: string | null
  workers: Array<{ id: string; name: string }>
  orders: Array<{ id: string; orderNumber: string }>
}

/** Machine chatter, not work: every stage QA pass emits one. Hidden unless asked for. */
const LABEL_EVENT_TYPES = ['LABEL_PRINT_REQUESTED', 'LABEL_REPRINT_REQUESTED'] as const satisfies readonly PieceEventType[]

const ACTIVITY_DEFAULT_LIMIT = 50
const ACTIVITY_MAX_LIMIT = 100
const isEventType = (s: string | undefined): s is PieceEventType => !!s && (PIECE_EVENT_TYPES as readonly string[]).includes(s)

/**
 * A cursor is `"<iso createdAt>|<row id>"`.
 *
 * `createdAt` alone is not unique — it has millisecond resolution and nothing
 * constrains it — so a cursor keyed on the timestamp with an exclusive `<`
 * silently skips every row after the first of a tie, and one keyed with `<=`
 * repeats rows forever. The row id breaks the tie, which is why the sort and
 * the cursor both carry it. A malformed or legacy cursor parses to null and is
 * ignored (the reader gets the newest page) rather than erroring: this value
 * travels in a URL people edit by hand.
 */
const parseCursor = (s: string | undefined): { at: Date; id: string } | null => {
  if (!s) return null
  const bar = s.lastIndexOf('|')
  if (bar <= 0) return null
  const at = new Date(s.slice(0, bar))
  const id = s.slice(bar + 1)
  return Number.isNaN(at.getTime()) || !id ? null : { at, id }
}

/**
 * The raw event feed, newest first, keyset-paginated on `(createdAt, id)`.
 *
 * `before` is a cursor rather than an offset so a page cannot shift under the
 * reader while the floor keeps working. The filter dropdowns ride along with
 * the first page — two tiny queries, and the client never has to know a second
 * endpoint. An unrecognised `eventType` filters nothing rather than erroring:
 * the value comes from a URL people edit.
 */
export async function listActivity(q: ActivityQuery = {}): Promise<ActivityPage> {
  const limit = Math.min(Math.max(1, q.limit ?? ACTIVITY_DEFAULT_LIMIT), ACTIVITY_MAX_LIMIT)
  const cursor = parseCursor(q.before)
  const where: Prisma.PieceEventWhereInput = {
    // Strictly "older than the cursor row" in the same total order the rows are
    // sorted by: an earlier instant, or the same instant and a lower id.
    ...(cursor ? { OR: [{ createdAt: { lt: cursor.at } }, { createdAt: cursor.at, id: { lt: cursor.id } }] } : {}),
    ...(q.workerId ? { workerId: q.workerId } : {}),
    // The hide is a `where` clause, not a post-filter, so it composes with the
    // keyset cursor: a page is `limit` visible rows, never `limit` rows with
    // the label ones cut out afterwards leaving a short page and a gap.
    //
    // Naming one event type wins over the hide — a reader who picked "Label
    // print requested" from the dropdown asked for exactly those rows, and an
    // empty feed would read as "this never happens".
    eventType: isEventType(q.eventType)
      ? q.eventType
      : q.includeLabelEvents
        ? undefined
        : { notIn: [...LABEL_EVENT_TYPES] },
    ...(q.orderId ? { piece: { lineItem: { orderId: q.orderId } } } : {}),
  }

  const [rows, workers, orders] = await Promise.all([
    prisma.pieceEvent.findMany({
      where,
      // The id is a tiebreak, not decoration: without a total order the cursor
      // above cannot name a unique place to resume from.
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: {
        id: true, eventType: true, stage: true, createdAt: true, pieceId: true,
        user: { select: { name: true } },
        worker: { select: { name: true } },
        piece: { select: { serial: true, lineItem: { select: { style: { select: { styleCode: true } }, order: { select: { id: true, orderNumber: true } } } } } },
      },
    }),
    prisma.worker.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    prisma.order.findMany({ select: { id: true, orderNumber: true }, orderBy: { orderNumber: 'asc' } }),
  ])

  const page = rows.slice(0, limit)
  const last = page[page.length - 1]
  return {
    rows: page.map((e) => ({
      id: e.id,
      at: e.createdAt.toISOString(),
      eventType: e.eventType,
      stage: e.stage,
      user: e.user.name,
      worker: e.worker?.name ?? null,
      pieceId: e.pieceId,
      serial: e.piece.serial,
      styleCode: e.piece.lineItem.style.styleCode,
      orderId: e.piece.lineItem.order.id,
      orderNumber: e.piece.lineItem.order.orderNumber,
    })),
    nextBefore: rows.length > limit && last ? `${last.createdAt.toISOString()}|${last.id}` : null,
    workers,
    orders,
  }
}
