import Link from 'next/link'
import type { OrderRow } from '@hf/server'
import { StageStrip } from './StageStrip'
import { StatusPill } from './StatusPill'
import { Empty } from './ui'

export function OrdersTable({ orders, showProgram = false }: { orders: OrderRow[]; showProgram?: boolean }) {
  if (orders.length === 0) return <Empty>No orders yet.</Empty>
  return (
    <div className="overflow-x-auto">
      <table className="hf-table hf-cards w-full">
        <thead>
          <tr>
            <th>Order</th>{showProgram && <><th>Program</th><th>Buyer</th></>}<th>Due</th>
            <th className="hf-num">Lines</th><th className="hf-num">Ordered</th><th>Progress</th><th>Status</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id}>
              <td data-primary><Link href={`/orders/${o.id}`} className="font-semibold hover:underline">{o.orderNumber}</Link></td>
              {showProgram && <><td data-label="Program"><Link href={`/programs/${o.programId}`} className="hover:underline">{o.programName}</Link></td><td data-label="Buyer">{o.buyerName}</td></>}
              <td data-label="Due">{o.dueDate ?? '—'}</td>
              <td data-label="Lines" className="hf-num">{o.lineItemCount}</td>
              <td data-label="Ordered" className="hf-num">{o.progress.ordered}</td>
              <td className="md:min-w-[260px]"><StageStrip compact counts={o.progress.counts} ordered={o.progress.ordered} scope={{ orderId: o.id }} /></td>
              <td data-label="Status"><StatusPill status={o.progress.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
