import Link from 'next/link'
import { notFound } from 'next/navigation'
import { cartonsForOrder, getOrder, listLabels, listStyles } from '@hf/server'
import { Cartons } from '@/components/Cartons'
import { Drawer } from '@/components/Drawer'
import { LineItemForm } from '@/components/forms/LineItemForm'
import { OrderForm } from '@/components/forms/OrderForm'
import { PrintLabelsForm } from '@/components/forms/PrintLabelsForm'
import { QuantityForm } from '@/components/forms/QuantityForm'
import { StageStrip } from '@/components/StageStrip'
import { StatusPill } from '@/components/StatusPill'
import { Empty, Facts, PageHeader } from '@/components/ui'
import { piecesHref } from '@/lib/links'
import { pageUser } from '@/lib/page-user'
import { canWrite } from '@/lib/roles'

export const dynamic = 'force-dynamic'

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await pageUser()
  const [order, styles] = await Promise.all([getOrder(id), listStyles({ activeOnly: true })])
  if (!order) notFound()
  const write = canWrite(user)
  const [pendingPlanned, cartons] = await Promise.all([
    listLabels({ kind: 'planned', status: 'pending', orderId: id }).then((l) => l.length),
    cartonsForOrder(order.id),
  ])

  return (
    <>
      <PageHeader eyebrow={<Link href={`/programs/${order.programId}`} className="hover:underline">{order.programName}</Link>} title={order.orderNumber}>
        <Drawer title="Print labels" trigger={`Print labels (${pendingPlanned})`} variant="ghost">
          <PrintLabelsForm scope={{ orderId: id }} pending={pendingPlanned} />
        </Drawer>
        {write && (
          <>
            <Drawer title="Edit order" trigger="Edit" variant="ghost"><OrderForm order={{ id: order.id, orderNumber: order.orderNumber, dueDate: order.dueDate }} /></Drawer>
            <Drawer title="Add line item" trigger="Add line item">
              {styles.length === 0 ? <p className="text-sm">Create a style first, under Styles.</p> : <LineItemForm orderId={order.id} styles={styles} />}
            </Drawer>
          </>
        )}
      </PageHeader>

      <Facts items={[
        ['Buyer', order.buyerName], ['Buying house', order.agentName ?? 'Direct'], ['Due', order.dueDate ?? '—'],
        ['Line items', order.lineItemCount], ['Ordered pieces', order.progress.ordered], ['Status', <StatusPill key="s" status={order.progress.status} />],
      ]} />

      <section className="mb-8">
        <h2 className="hf-label mb-2" style={{ color: 'var(--hf-muted)' }}>Progress across the order</h2>
        <StageStrip counts={order.progress.counts} ordered={order.progress.ordered} scope={{ orderId: order.id }} />
      </section>

      <h2 className="hf-display mb-3 text-xl">Line items</h2>
      {order.lineItems.length === 0 ? (
        <Empty>No line items. Add one to generate the planned pieces the floor will cut.</Empty>
      ) : (
        <div className="overflow-x-auto">
          <table className="hf-table hf-cards w-full">
            <thead>
              <tr>
                <th>Style</th><th>Size</th><th>Shade</th><th className="hf-num">Qty</th>
                <th className="hf-num">Cut</th><th className="hf-num">Paste</th><th className="hf-num">Stitch</th><th className="hf-num">Finish</th><th className="hf-num">QC</th><th className="hf-num">Packed</th>
                <th className="hf-num">Rejected</th><th className="hf-num">Hold</th><th className="hf-num">Replaced</th>{write && <th />}
              </tr>
            </thead>
            <tbody>
              {order.lineItems.map((li) => {
                const c = li.progress.counts
                const scope = { lineItemId: li.id }
                const activated = c.total - c.planned - c.cancelled
                const n = (label: string, v: number, q: Parameters<typeof piecesHref>[1]) => <td data-label={label} className="hf-num"><Link href={piecesHref(scope, q)} className="hover:underline">{v}</Link></td>
                return (
                  <tr key={li.id}>
                    <td data-primary><Link href={`/line-items/${li.id}`} className="font-semibold hover:underline">{li.style.styleCode}</Link> <span style={{ color: 'var(--hf-muted)' }}>{li.style.category}</span></td>
                    <td data-label="Size">{li.size}</td><td data-label="Shade">{li.shade}</td>
                    <td data-label="Qty" className="hf-num">{li.quantity}</td>
                    {n('Cut', c.cutting, { atOrPast: 'cutting' })}{n('Paste', c.pasting, { atOrPast: 'pasting' })}{n('Stitch', c.stitching, { atOrPast: 'stitching' })}
                    {n('Finish', c.finishing, { atOrPast: 'finishing' })}{n('QC', c.qc, { atOrPast: 'qc' })}{n('Packed', c.packaging, { atOrPast: 'packaging' })}
                    {n('Rejected', c.rejected, { state: 'REJECTED' })}{n('Hold', c.onHold, { state: 'ON_HOLD' })}
                    <td data-label="Replaced" className="hf-num">{li.progress.replaced}</td>
                    {write && (
                      <td className="text-right">
                        <Drawer title={`Change quantity · ${li.style.styleCode} ${li.size} ${li.shade}`} trigger="Qty" variant="ghost">
                          <QuantityForm lineItemId={li.id} current={li.quantity} activated={activated} />
                        </Drawer>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="hf-display mb-3 mt-8 text-xl">Cartons</h2>
      <Cartons orderId={order.id} cartons={cartons} canShip={write} />
    </>
  )
}
