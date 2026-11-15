import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getReceipt } from '@hf/server'
import { formatKolkata } from '@hf/server/format'
import { EventPhoto } from '@/components/EventPhoto'
import { DiscrepancyBadge, StatusBadge } from '@/components/inventory/ReceiptBadges'
import { Card, CardContent } from '@/components/shadcn/card'
import { Facts, PageHeader } from '@/components/ui'
import { pageUser } from '@/lib/page-user'

export const dynamic = 'force-dynamic'

const PURPOSE: Record<'goods' | 'place' | 'document', string> = { goods: 'Goods', place: 'Where it was put', document: 'Paper receipt' }
const EVENT: Record<'RECEIPT_RECORDED' | 'RECEIPT_COUNTED', string> = { RECEIPT_RECORDED: 'Recorded', RECEIPT_COUNTED: 'Counted' }

/** Photos left, the tally right, then who did what and when. Signed urls, 15 minutes. */
export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  await pageUser()
  const { id } = await params
  const r = await getReceipt(id)
  if (!r) notFound()
  const suggestionsRaw = (r.events.find((e) => e.eventType === 'RECEIPT_RECORDED')?.details as { suggestions?: unknown } | null)?.suggestions ?? null
  const suggestions = suggestionsRaw && typeof suggestionsRaw === 'object' && Object.keys(suggestionsRaw).length > 0 ? suggestionsRaw : null
  return (
    <>
      <PageHeader eyebrow={<Link href="/inventory" className="hover:underline">Inventory</Link>} title={`Receipt ${r.reference ?? ''}`.trim()}>
        <span className="flex gap-2"><StatusBadge status={r.status} />{r.hasDiscrepancy && <DiscrepancyBadge />}</span>
      </PageHeader>
      <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <Card className="gap-0 rounded-lg py-4 shadow-none [background:var(--hf-card)] [border-color:var(--hf-line)]">
          <CardContent className="grid gap-4 px-4">
            {(['goods', 'place', 'document'] as const).map((purpose) => (
              <div key={purpose} className="grid gap-2">
                <span className="hf-label" style={{ color: 'var(--hf-muted)' }}>{PURPOSE[purpose]}</span>
                <div className="flex flex-wrap gap-2">
                  {r.photos.filter((p) => p.purpose === purpose).map((p) => <EventPhoto key={p.id} url={p.url} alt={`${PURPOSE[purpose]} photo`} />)}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
        <div>
          <Facts items={[['Supplier', r.supplier ?? '—'], ['Receipt no.', r.reference ?? '—'], ['Shelf', r.location ?? '—'], ['Received', `${formatKolkata(r.receivedAt)} · ${r.receivedBy}`], ['Counted', r.countedAt ? `${formatKolkata(r.countedAt)} · ${r.countedBy}` : 'Not yet'], ['Note', r.note ?? r.countNote ?? '—']]} />
          <table className="hf-table hf-cards w-full">
            <thead><tr><th>Item</th><th className="hf-num">Receipt says</th><th className="hf-num">Counted</th><th className="hf-num">Variance</th></tr></thead>
            <tbody>
              {r.lines.map((l) => (
                <tr key={l.itemId}>
                  <td data-primary><span className="font-mono font-semibold">{l.code}</span> <span style={{ color: 'var(--hf-muted)' }}>{l.nameEn}{l.addedAtCount ? ' · added at count' : ''}</span></td>
                  <td data-label="Receipt says" className="hf-num">{l.expectedQty ?? '—'}</td>
                  <td data-label="Counted" className="hf-num">{l.countedQty ?? '—'}</td>
                  <td data-label="Variance" className="hf-num" style={l.variance ? { color: 'var(--hf-oxblood-deep)', fontWeight: 600 } : undefined}>{l.variance === null ? '—' : l.variance > 0 ? `+${l.variance}` : String(l.variance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <h2 className="hf-display mb-3 mt-6 text-xl">Timeline</h2>
          <ol className="grid gap-2">
            {r.events.map((e) => (
              <li key={e.id} className="rounded-lg border p-3 text-sm" style={{ borderColor: 'var(--hf-line)', background: 'var(--hf-card)' }}>
                <span className="font-semibold">{EVENT[e.eventType]}</span> by {e.by} · <span style={{ color: 'var(--hf-muted)' }}>{formatKolkata(e.createdAt)}</span>
              </li>
            ))}
          </ol>
          {suggestions && (
            <details className="mt-4 text-sm">
              <summary className="cursor-pointer" style={{ color: 'var(--hf-muted)' }}>What the photo reader suggested</summary>
              <pre className="mt-2 overflow-x-auto rounded-lg border p-3 text-xs" style={{ borderColor: 'var(--hf-line)', background: 'var(--hf-card)' }}>{JSON.stringify(suggestions, null, 2)}</pre>
            </details>
          )}
        </div>
      </div>
    </>
  )
}
