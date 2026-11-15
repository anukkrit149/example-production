'use client'

import Link from 'next/link'
import { AdminStrip } from '@/components/AdminStrip'
import { useT } from '@/lib/i18n/useT'

type Door = { href: string; titleKey: 'home_production' | 'home_pieces' | 'home_inventory'; hintKey: 'home_production_hint' | 'home_pieces_hint' | 'home_inventory_hint' }

const DOORS: Door[] = [
  { href: '/scan', titleKey: 'home_production', hintKey: 'home_production_hint' },
  { href: '/pieces', titleKey: 'home_pieces', hintKey: 'home_pieces_hint' },
  { href: '/inventory', titleKey: 'home_inventory', hintKey: 'home_inventory_hint' },
]

/**
 * Three equal doors onto the floor.
 *
 * No door outranks another — a store operator's day might start at any of the
 * three — so all three share one card style: ink text on `--hf-card`, an
 * oxblood chevron the only colour accent, 96 px tall so a gloved thumb cannot
 * miss. The accessible name is the title alone (not title + hint), which is
 * what lets a test — or a screen reader user — ask for "Inventory" and get
 * exactly one match.
 */
export function HomeDoors({ role }: { role: string }) {
  const { t } = useT()
  const showAdminStrip = role === 'admin'
  const showLabelsLink = role === 'store' || role === 'supervisor'

  return (
    <>
      <h1 className="hf-display text-2xl">{t('home_title')}</h1>

      <ul className="grid gap-3">
        {DOORS.map((door) => (
          <li key={door.href}>
            <Link
              href={door.href}
              aria-label={t(door.titleKey)}
              className="flex items-center gap-4 rounded-xl border-2 px-4"
              style={{ minHeight: '96px', borderColor: 'var(--hf-line)', background: 'var(--hf-card)', color: 'var(--hf-ink)' }}
            >
              <span className="grid min-w-0 flex-1 gap-1">
                <span className="hf-display text-xl leading-tight">{t(door.titleKey)}</span>
                <span className="truncate text-base" style={{ color: 'var(--hf-muted)' }}>{t(door.hintKey)}</span>
              </span>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="shrink-0">
                <path d="m9 6 6 6-6 6" stroke="var(--hf-oxblood-lit)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
          </li>
        ))}
      </ul>

      {showAdminStrip && <AdminStrip />}

      {showLabelsLink && (
        <Link href="/admin/labels" className="hf-ui text-base underline" style={{ color: 'var(--hf-muted)' }}>
          {t('nav_labels')}
        </Link>
      )}
    </>
  )
}
