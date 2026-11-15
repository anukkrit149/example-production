import Link from 'next/link'
import type { ActivityPage } from '@hf/server'
import { formatEventType, formatKolkata, formatSerial, stageColor } from '@hf/server/format'
import { FeedFilters, type FeedFilterValues } from '@/components/overview/FeedFilters'
import { Badge } from '@/components/shadcn/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/shadcn/table'
import { Empty } from '@/components/ui'

export type { FeedFilterValues }

/**
 * Everything that happened, newest first.
 *
 * The filters navigate on change and the page cursor is a link, so the whole
 * feed is addressable: a supervisor can send "here is what this worker did" as
 * a URL. `before` is deliberately *not* carried through a filter change —
 * changing a filter has to restart at the newest page, or the reader would be
 * paging through a cursor that was minted for a different query.
 *
 * The period stays in the URL through both, because the tiles and graphs above
 * belong to it; the feed itself is not period-bound (D6).
 */
export function ActivityFeed({ page, filters }: { page: ActivityPage; filters: FeedFilterValues }) {
  const showingLabels = filters.labels === '1'
  const more = page.nextBefore
    ? `/overview?${new URLSearchParams({ ...clean(filters), before: page.nextBefore }).toString()}`
    : null
  // The toggle keeps every other filter and drops the cursor, for the same
  // reason a filter change does: the visible rows are about to change under it.
  const toggleHref = `/overview?${new URLSearchParams(clean({ ...filters, labels: showingLabels ? undefined : '1' })).toString()}`

  return (
    <section aria-label="Activity">
      <h2 className="hf-display mb-3 text-xl">Activity</h2>

      <FeedFilters filters={filters} workers={page.workers} orders={page.orders} />

      <p className="mb-4 flex flex-wrap items-baseline gap-2 text-xs" style={{ color: 'var(--hf-muted)' }}>
        <Link href={toggleHref} scroll={false} className="hf-ui text-xs uppercase underline" style={{ color: 'var(--hf-oxblood-lit)' }}>
          {showingLabels ? 'Hide label prints' : 'Show label prints'}
        </Link>
        {!showingLabels && <span>Hidden — every stage QA pass asks for one.</span>}
      </p>

      {page.rows.length === 0 ? (
        <Empty>Nothing has happened yet.</Empty>
      ) : (
        <>
          <Table aria-label="Activity" className="hf-table hf-cards w-full">
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Who</TableHead>
                <TableHead>Event</TableHead>
                <TableHead>Piece</TableHead>
                <TableHead>Order</TableHead>
                <TableHead>Stage</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {page.rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell data-primary>{formatKolkata(r.at)}</TableCell>
                  <TableCell data-label="Who">{r.worker ? `${r.worker} · ${r.user}` : r.user}</TableCell>
                  <TableCell data-label="Event">{formatEventType(r.eventType)}</TableCell>
                  <TableCell data-label="Piece">
                    <Link href={`/pieces/${r.pieceId}`} className="font-mono text-xs hover:underline">
                      {formatSerial(r.serial)} {r.styleCode}
                    </Link>
                  </TableCell>
                  <TableCell data-label="Order">{r.orderNumber}</TableCell>
                  <TableCell data-label="Stage">
                    {r.stage
                      ? (
                        <Badge
                          variant="outline"
                          className="hf-ui text-[10px] uppercase"
                          style={{ borderColor: stageColor(r.stage), color: stageColor(r.stage) }}
                        >
                          {r.stage}
                        </Badge>
                      )
                      : '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {more && (
            <div className="mt-4">
              <Link href={more} scroll={false} className="hf-ui text-xs uppercase underline" style={{ color: 'var(--hf-oxblood-lit)' }}>Load more</Link>
            </div>
          )}
        </>
      )}
    </section>
  )
}

const clean = (f: FeedFilterValues): Record<string, string> =>
  Object.fromEntries(Object.entries(f).flatMap(([k, v]) => (v ? [[k, v]] : [])))
