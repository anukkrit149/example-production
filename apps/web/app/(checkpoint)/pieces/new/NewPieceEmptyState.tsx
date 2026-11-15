'use client'

import Link from 'next/link'
import { useT } from '@/lib/i18n/useT'

/**
 * Shown when every planned piece on every order has already been cut. Split
 * out from the server-rendered page so it can call `useT`, same shape as
 * `PieceActions`.
 */
export function NewPieceEmptyState() {
  const { t } = useT()
  return (
    <>
      <h1 className="hf-display text-2xl">{t('new_piece_title')}</h1>
      <p className="text-lg" style={{ color: 'var(--hf-muted)' }}>
        Every planned piece on every order has already been cut. There is nothing left to
        activate.
      </p>
      <Link
        href="/scan"
        className="hf-ui flex min-h-14 items-center justify-center rounded-lg border-2 px-4 text-base uppercase"
        style={{ borderColor: 'var(--hf-line)', background: 'var(--hf-card)' }}
      >
        Back to scan
      </Link>
    </>
  )
}
