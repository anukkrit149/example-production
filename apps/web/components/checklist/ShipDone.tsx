'use client'

import Link from 'next/link'
import { useT } from '@/lib/i18n/useT'

/**
 * The end of a ship: a count, not a state. A carton moves several pieces at
 * once, so there is no single piece to name here the way `Done` names one —
 * the number shipped is the whole story, and the next move is back to the
 * order picker for the next carton, not "scan another".
 */
export function ShipDone({ shipped }: { shipped: number }) {
  const { t } = useT()

  return (
    <section
      className="grid justify-items-center gap-6 rounded-xl border-2 p-6 text-center"
      style={{ background: 'var(--hf-stage-finishing)', borderColor: 'var(--hf-stage-finishing)', color: '#fff' }}
      role="status"
      aria-live="polite"
    >
      <svg width="120" height="120" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.6" opacity={0.6} />
        <path d="m7 12.4 3.3 3.3L17 8.6" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>

      <div className="grid gap-1">
        <p className="hf-label text-[10px]" style={{ opacity: 0.85 }}>{t('shipped_ok')}</p>
        <p className="hf-display text-3xl leading-tight">{shipped} {t('ship_pieces')}</p>
      </div>

      <Link
        href="/ship"
        className="hf-ui flex min-h-16 w-full items-center justify-center rounded-xl border-2 px-4 text-xl uppercase"
        style={{ background: '#fff', borderColor: '#fff', color: 'var(--hf-ink)' }}
      >
        {t('ship_title')}
      </Link>

      <Link
        href="/home"
        className="hf-ui flex min-h-14 w-full items-center justify-center rounded-xl border-2 px-4 text-lg uppercase"
        style={{ background: 'transparent', borderColor: '#fff', color: '#fff' }}
      >
        {t('nav_home')}
      </Link>
    </section>
  )
}
