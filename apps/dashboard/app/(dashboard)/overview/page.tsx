import Link from 'next/link'
import { getOverview, listActivity } from '@hf/server'
import { formatKolkata } from '@hf/server/format'
import { ActivityFeed } from '@/components/overview/ActivityFeed'
import { AutoRefresh } from '@/components/overview/AutoRefresh'
import { CumulativeChart } from '@/components/overview/charts/CumulativeChart'
import { QaChart } from '@/components/overview/charts/QaChart'
import { ThroughputChart } from '@/components/overview/charts/ThroughputChart'
import { WorkerChart } from '@/components/overview/charts/WorkerChart'
import { OrdersAtRisk } from '@/components/overview/OrdersAtRisk'
import { PeriodBar } from '@/components/overview/PeriodBar'
import { Tiles } from '@/components/overview/Tiles'
import { StageStrip } from '@/components/StageStrip'
import { PageHeader } from '@/components/ui'
import { pageUser } from '@/lib/page-user'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Overview · Sample Factory Dashboard' }

type Q = { period?: string; date?: string; before?: string; workerId?: string; orderId?: string; eventType?: string; labels?: string }

/**
 * The factory pulse: what we did in the chosen window, what is on the floor
 * right now, where the order book is heading, and what just happened.
 *
 * Every number on this screen comes from the server payload — nothing is
 * re-derived here. The two calls go out together because neither depends on
 * the other: the tiles and graphs are period-bound, the feed is not.
 */
export default async function OverviewPage({ searchParams }: { searchParams: Promise<Q> }) {
  const q = await searchParams
  await pageUser()
  const [o, feed] = await Promise.all([
    getOverview({ period: q.period, date: q.date }),
    listActivity({ before: q.before, workerId: q.workerId, orderId: q.orderId, eventType: q.eventType, includeLabelEvents: q.labels === '1' }),
  ])

  const bucketKind = o.period.kind === 'today' || o.period.kind === 'day' ? 'hour' : 'day'
  const labels = o.period.buckets.map((b) => b.label)

  return (
    <>
      <PageHeader title="Overview" eyebrow="Factory pulse">
        <AutoRefresh asOf={formatKolkata(o.asOf)} />
      </PageHeader>

      <PeriodBar period={o.period} filters={{ workerId: q.workerId, orderId: q.orderId, eventType: q.eventType, labels: q.labels }} />

      {/*
        `rangeLabel` is "This week · Mon 31 Aug – Sun 6 Sep": the period name,
        then the days it covers. The name is the heading and the days ride
        alongside it, muted, so a reader never has to guess where "this week"
        started. A chosen day is already named by its date — its `rangeLabel` is
        its `label`, and there is nothing to set beside it.
      */}
      <h2 className="hf-display mb-3 flex flex-wrap items-baseline gap-x-2 text-xl">
        {o.period.label}
        {o.period.rangeLabel !== o.period.label && (
          <span className="hf-ui text-xs font-normal" style={{ color: 'var(--hf-muted)' }}>
            {o.period.rangeLabel.split('·').slice(1).join('·').trim()}
          </span>
        )}
      </h2>
      <Tiles numbers={o.numbers} />

      <div className="mb-10 grid gap-8 md:grid-cols-2">
        <section>
          <ThroughputChart series={o.throughput} labels={labels} bucketKind={bucketKind} />
        </section>
        <section>
          <CumulativeChart cumulative={o.cumulative} />
        </section>
      </div>

      <section className="mb-10">
        <h2 className="hf-display mb-3 text-xl">In the factory right now</h2>
        <div className="mb-4">
          <StageStrip counts={o.rightNow.counts} ordered={o.rightNow.ordered} scope={{}} />
        </div>
        <div className="mb-6 grid grid-cols-2 gap-2 md:grid-cols-4">
          {(
            [
              ['withWorkers', 'Out with workers', o.rightNow.withWorkers, '/wip'],
              ['awaitingQa', 'Waiting for QA', o.rightNow.awaitingQa, '/wip'],
              ['onHold', 'On hold', o.rightNow.onHold, '/pieces?state=ON_HOLD'],
              ['planned', 'Planned, not started', o.rightNow.planned, '/pieces?state=PLANNED'],
            ] as const
          ).map(([key, label, value, href]) => (
            <Link key={key} href={href} className="rounded-lg border p-3" style={{ borderColor: 'var(--hf-line)', background: 'var(--hf-card)' }}>
              <span className="hf-num block text-left text-2xl font-semibold">{value}</span>
              <span className="hf-label mt-1 block" style={{ color: 'var(--hf-muted)' }}>{label}</span>
            </Link>
          ))}
        </div>
        <h3 className="hf-display mb-2 text-lg">Orders at risk</h3>
        <p className="mb-3 text-sm" style={{ color: 'var(--hf-muted)' }}>
          Each projected finish uses that order&apos;s own packing rate over the selected period, or its last seven days when
          the period saw none. An order that has not packed anything yet reads &quot;Not moving&quot;.
        </p>
        <OrdersAtRisk rows={o.ordersAtRisk} />
      </section>

      <div className="mb-10 grid gap-8 md:grid-cols-2">
        <section>
          <WorkerChart workers={o.workers} />
        </section>
        <section>
          <QaChart qa={o.qa} />
        </section>
      </div>

      <ActivityFeed
        page={feed}
        filters={{ workerId: q.workerId, orderId: q.orderId, eventType: q.eventType, period: q.period, date: q.date, labels: q.labels }}
      />
    </>
  )
}
