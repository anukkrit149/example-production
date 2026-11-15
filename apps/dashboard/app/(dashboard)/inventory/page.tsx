import Link from 'next/link'
import { listReceipts, stockOnHand } from '@hf/server'
import { formatKolkata } from '@hf/server/format'
import { DiscrepancyBadge, StatusBadge } from '@/components/inventory/ReceiptBadges'
import { ReceiptFilters } from '@/components/inventory/ReceiptFilters'
import { StockTiles } from '@/components/inventory/StockTiles'
import { Empty, PageHeader } from '@/components/ui'
import { pageUser } from '@/lib/page-user'
import { isAdmin } from '@/lib/roles'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Inventory · Sample Factory Dashboard' }

/** Stock on hand per item, then every delivery: what came in, who took it, whether the count matched. */
export default async function InventoryPage({ searchParams }: { searchParams: Promise<{ status?: string; discrepancy?: string }> }) {
  const user = await pageUser()
  const { status, discrepancy } = await searchParams
  const statusFilter = status === 'RECEIVED' || status === 'COUNTED' ? status : undefined
  const [stock, page] = await Promise.all([stockOnHand(), listReceipts({ status: statusFilter, discrepancy: discrepancy === '1', limit: 100 })])
  const summary = (items: Array<{ code: string; expectedQty: number | null; countedQty: number | null }>) =>
    items.map((i) => `${i.code} ${i.countedQty ?? i.expectedQty ?? '—'}`).join(' · ')
  return (
    <>
      <PageHeader title="Inventory">{isAdmin(user) && <Link href="/inventory/items" className="hf-ui rounded-md border px-4 py-2 text-xs uppercase" style={{ borderColor: 'var(--hf-line)' }}>Items</Link>}</PageHeader>
      <StockTiles rows={stock.filter((r) => r.item.active || r.onHand > 0)} />
      <h2 className="hf-display mb-3 text-xl">Receipts</h2>
      <ReceiptFilters filters={{ status, discrepancy }} />
      {page.receipts.length === 0 ? <Empty>No receipts match. Deliveries recorded on the phone appear here.</Empty> : (
        <table className="hf-table hf-cards w-full">
          <thead><tr><th>Received</th><th>Receipt no.</th><th>Supplier</th><th>Items</th><th>Received by</th><th>Status</th><th>Counted by</th></tr></thead>
          <tbody>
            {page.receipts.map((r) => (
              <tr key={r.id}>
                <td data-primary>{formatKolkata(r.receivedAt)}</td>
                <td data-label="Receipt no."><Link href={`/inventory/receipts/${r.id}`} className="font-mono font-semibold hover:underline">{r.reference ?? 'No receipt no.'}</Link></td>
                <td data-label="Supplier">{r.supplier ?? '—'}</td>
                <td data-label="Items" className="font-mono text-xs">{summary(r.items)}</td>
                <td data-label="Received by">{r.receivedBy}</td>
                <td data-label="Status"><span className="flex flex-wrap gap-1"><StatusBadge status={r.status} />{r.hasDiscrepancy && <DiscrepancyBadge />}</span></td>
                <td data-label="Counted by">{r.countedBy ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  )
}
