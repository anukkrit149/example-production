'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useT } from '@/lib/i18n/useT'

/**
 * The header's one link back to the front door.
 *
 * Replaces the old multi-link nav row: every screen now has exactly one way
 * back, and it hides on `/home` itself — a link to the page you are already
 * on is not a link, it is clutter above the doors.
 */
export function HomeLink() {
  const { t } = useT()
  const pathname = usePathname()
  if (pathname === '/home') return null

  return (
    <Link href="/home" className="hf-label whitespace-nowrap text-[10px]" style={{ color: 'var(--hf-ink)' }}>
      {t('nav_home')}
    </Link>
  )
}
