'use client'

import Link from 'next/link'
import { useT } from '@/lib/i18n/useT'

/**
 * The two-item admin strip: Codes, Labels. Shown on Home for admins and again
 * at the top of the labels page itself, so an admin who lands on one door can
 * cross to the other without a trip back through Home.
 */
export function AdminStrip() {
  const { t } = useT()
  return (
    <nav className="flex gap-4">
      <Link href="/admin/operators" className="hf-label whitespace-nowrap text-[10px]" style={{ color: 'var(--hf-ink)' }}>
        {t('nav_codes')}
      </Link>
      <Link href="/admin/labels" className="hf-label whitespace-nowrap text-[10px]" style={{ color: 'var(--hf-ink)' }}>
        {t('nav_labels')}
      </Link>
    </nav>
  )
}
