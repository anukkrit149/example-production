import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getLineItem, listLabels } from '@hf/server'
import { Drawer } from '@/components/Drawer'
import { PrintLabelsForm } from '@/components/forms/PrintLabelsForm'
import { QuantityForm } from '@/components/forms/QuantityForm'
import { PieceTable } from '@/components/PieceTable'
import { StageStrip } from '@/components/StageStrip'
import { Facts, PageHeader } from '@/components/ui'
import { pageUser } from '@/lib/page-user'
import { canWrite } from '@/lib/roles'

export const dynamic = 'force-dynamic'

export default async function LineItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await pageUser()
  const li = await getLineItem(id)
  if (!li) notFound()
  const c = li.progress.counts
  const pendingPlanned = (await listLabels({ kind: 'planned', status: 'pending', lineItemId: li.id })).length
  return (
    <>
      <PageHeader
        eyebrow={<><Link href={`/programs/${li.programId}`} className="hover:underline">{li.programName}</Link> · <Link href={`/orders/${li.orderId}`} className="hover:underline">{li.orderNumber}</Link></>}
        title={`${li.style.styleCode} · ${li.size} · ${li.shade}`}
      >
        <Drawer title="Print labels" trigger={`Print labels (${pendingPlanned})`} variant="ghost">
          <PrintLabelsForm scope={{ lineItemId: li.id }} pending={pendingPlanned} />
        </Drawer>
        {canWrite(user) && (
          <Drawer title="Change quantity" trigger="Change quantity" variant="ghost">
            <QuantityForm lineItemId={li.id} current={li.quantity} activated={c.total - c.planned - c.cancelled} />
          </Drawer>
        )}
      </PageHeader>
      <Facts items={[['Category', li.style.category], ['Ordered', li.quantity], ['Planned', c.planned], ['Cancelled', c.cancelled], ['Replaced', li.progress.replaced]]} />
      <section className="mb-8"><StageStrip counts={c} ordered={li.progress.ordered} scope={{ lineItemId: li.id }} /></section>
      <h2 className="hf-display mb-3 text-xl">Pieces</h2>
      <PieceTable pieces={li.pieces} showLine={false} />
    </>
  )
}
