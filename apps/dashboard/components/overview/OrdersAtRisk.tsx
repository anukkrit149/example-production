import Link from 'next/link'
import type { OrderRisk } from '@hf/server'
import { Badge } from '@/components/shadcn/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/shadcn/table'
import { Empty } from '@/components/ui'

/**
 * The open order book, worst first.
 *
 * "Late" is a word, not a colour: a supervisor reading this on a phone in
 * factory light — or anyone who cannot separate red from grey — has to be able
 * to see it, so it renders as an outline badge carrying the word, not
 * decoration. The projection uses each order's own packing rate (shown beside
 * the date), so a floor split across several orders does not promise every one
 * of them the whole floor; an order that has packed nothing reads "Not moving".
 */
export function OrdersAtRisk({ rows }: { rows: OrderRisk[] }) {
  if (rows.length === 0) return <Empty>No open order has a due date.</Empty>
  return (
    <Table aria-label="Orders at risk" className="hf-table hf-cards w-full">
      <TableHeader>
        <TableRow>
          <TableHead>Order</TableHead>
          <TableHead>Program</TableHead>
          <TableHead>Due</TableHead>
          <TableHead>Ordered</TableHead>
          <TableHead>Packed</TableHead>
          <TableHead>%</TableHead>
          <TableHead>Days left</TableHead>
          <TableHead>
            Projected finish
            <span className="normal-case tracking-normal"> · at this order&apos;s rate</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.id}>
            <TableCell data-primary>
              <Link href={`/orders/${r.id}`} className="hover:underline">{r.orderNumber}</Link>
              {r.late && (
                <Badge
                  variant="outline"
                  className="hf-ui ml-2 text-[10px] uppercase"
                  style={{ borderColor: 'var(--hf-oxblood-deep)', color: 'var(--hf-oxblood-deep)' }}
                >
                  late
                </Badge>
              )}
            </TableCell>
            <TableCell data-label="Program">{r.programName}</TableCell>
            <TableCell data-label="Due">{r.dueDate}</TableCell>
            <TableCell data-label="Ordered" className="hf-num">{r.ordered}</TableCell>
            <TableCell data-label="Packed" className="hf-num">{r.packed}</TableCell>
            <TableCell data-label="%" className="hf-num">{r.percent}%</TableCell>
            <TableCell data-label="Days left" className="hf-num">{r.daysLeft}</TableCell>
            <TableCell data-label="Projected finish">
              {r.projectedFinish ? <>{r.projectedFinish} <span style={{ color: 'var(--hf-muted)' }}>· {r.dailyRate}/day</span></> : 'Not moving'}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
