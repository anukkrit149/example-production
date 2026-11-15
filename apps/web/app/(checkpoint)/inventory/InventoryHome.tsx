'use client'
import Link from 'next/link'
import type { ReceiptSummary } from '@hf/server'
import { formatKolkata } from '@hf/server/format'
import { useT } from '@/lib/i18n/useT'

const PRIMARY = 'hf-ui flex min-h-14 w-full items-center justify-center rounded-lg border-2 px-4 text-base uppercase'

export function InventoryHome({ canCount, toCount, recent }: { canCount: boolean; toCount: ReceiptSummary[]; recent: ReceiptSummary[] }) {
  const { t } = useT()
  const codes = (r: ReceiptSummary) => r.items.map((i) => i.code).join(' · ')
  return (
    <>
      <h1 className="hf-display text-2xl">{t('inv_title')}</h1>
      <Link href="/inventory/receive" className={PRIMARY} style={{ background: 'var(--hf-oxblood-lit)', borderColor: 'var(--hf-oxblood-lit)', color: 'var(--hf-paper)' }}>
        {t('inv_received_delivery')}
      </Link>

      {canCount && (
        <section className="grid gap-2">
          <h2 className="hf-label text-[10px]" style={{ color: 'var(--hf-muted)' }}>{t('inv_to_count')}</h2>
          {toCount.length === 0 && <p className="text-lg" style={{ color: 'var(--hf-muted)' }}>{t('inv_none_to_count')}</p>}
          <ul className="grid gap-2">
            {toCount.map((r) => (
              <li key={r.id}>
                <Link href={`/inventory/receipts/${r.id}/count`} className="flex min-h-16 items-center gap-3 rounded-lg border-2 px-3 py-2" style={{ borderColor: 'var(--hf-line)', background: 'var(--hf-card)', color: 'var(--hf-ink)' }}>
                  {r.thumbnailUrl
                    // eslint-disable-next-line @next/next/no-img-element -- signed, short-lived url
                    ? <img src={r.thumbnailUrl} alt="" className="h-12 w-12 shrink-0 rounded-md border object-cover" style={{ borderColor: 'var(--hf-line)' }} />
                    : <span aria-hidden className="h-12 w-12 shrink-0 rounded-md border border-dashed" style={{ borderColor: 'var(--hf-line)' }} />}
                  <span className="grid min-w-0 gap-0.5">
                    <span className="truncate font-mono text-base font-semibold">{codes(r)}</span>
                    <span className="truncate text-sm" style={{ color: 'var(--hf-muted)' }}>{r.supplier ?? '—'} · {r.receivedBy} · {formatKolkata(r.receivedAt)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {recent.length > 0 && (
        <section className="grid gap-2">
          <h2 className="hf-label text-[10px]" style={{ color: 'var(--hf-muted)' }}>{t('inv_recent')}</h2>
          <ul className="grid gap-2">
            {recent.map((r) => (
              <li key={r.id} className="grid gap-0.5 rounded-lg border px-3 py-2" style={{ borderColor: 'var(--hf-line)', background: 'var(--hf-card)' }}>
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate font-mono text-base font-semibold">{codes(r)}</span>
                  <span className="hf-ui shrink-0 rounded px-2 py-0.5 text-[11px] uppercase" style={r.status === 'COUNTED' ? { background: 'var(--hf-ink)', color: 'var(--hf-paper)' } : { background: 'var(--hf-line)', color: 'var(--hf-ink)' }}>
                    {t(r.status === 'COUNTED' ? 'inv_counted_status' : 'inv_awaiting')}{r.hasDiscrepancy ? ` · ${t('inv_discrepancy')}` : ''}
                  </span>
                </span>
                <span className="text-sm" style={{ color: 'var(--hf-muted)' }}>{r.supplier ?? '—'} · {formatKolkata(r.receivedAt)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  )
}
