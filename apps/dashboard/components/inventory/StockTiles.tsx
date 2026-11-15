import type { StockRow } from '@hf/server'
import { Card, CardContent } from '@/components/shadcn/card'

/** One card per item: on hand from counted receipts, and how many receipts still wait for a count. */
export function StockTiles({ rows }: { rows: StockRow[] }) {
  return (
    <div className="mb-8 grid grid-cols-2 gap-2 md:grid-cols-4">
      {rows.map((r) => (
        <Card key={r.item.id} className="gap-0 rounded-lg py-3 shadow-none [background:var(--hf-card)] [border-color:var(--hf-line)]" style={{ opacity: r.item.active ? 1 : 0.6 }}>
          <CardContent className="px-3">
            <span className="hf-num block text-left text-2xl font-semibold">{r.onHand}<span className="ml-1 text-sm font-normal" style={{ color: 'var(--hf-muted)' }}>{r.item.unit}</span></span>
            <span className="hf-label mt-1 block" style={{ color: 'var(--hf-muted)' }}>{r.item.code} · {r.item.nameEn}</span>
            <span className="mt-1 block text-xs" style={{ color: 'var(--hf-muted)' }}>{r.awaitingCount === 0 ? 'Nothing waiting' : `${r.awaitingCount} awaiting count`}</span>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
