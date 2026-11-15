'use client'
import Image from 'next/image'
import Link, { useLinkStatus } from 'next/link'
import { usePathname } from 'next/navigation'

const NAV = [
  ['/overview', 'Overview'], ['/programs', 'Programs'], ['/orders', 'Orders'], ['/styles', 'Styles'], ['/organizations', 'Buyers'], ['/wip', 'WIP'], ['/inventory', 'Inventory'], ['/labels', 'Labels'],
] as const

/**
 * The label inside each nav link. `useLinkStatus` is true from the click until
 * the new route has rendered, so the item the user chose acknowledges the
 * click at once — a small pulsing mark — even when the server round trip is
 * still on its way. Without it a click did nothing visible for the whole trip.
 */
function NavLabel({ label }: { label: string }) {
  const { pending } = useLinkStatus()
  return (
    <span className="flex items-center justify-between gap-2">
      {label}
      {pending && <span aria-hidden className="hf-skeleton inline-block h-1.5 w-1.5 rounded-full" style={{ background: 'currentColor' }} />}
    </span>
  )
}

export const navItems = (isAdmin: boolean) => (isAdmin ? [...NAV, ['/team', 'Team'] as const, ['/checklists', 'Checklists'] as const] : NAV)

export function Sidebar({ isAdmin }: { isAdmin: boolean }) {
  const path = usePathname()
  const items = navItems(isAdmin)
  return (
    <nav className="hidden w-56 shrink-0 flex-col border-r px-5 py-6 md:flex" style={{ borderColor: 'var(--hf-line)' }}>
      <Link href="/overview" aria-label="Sample Factory" className="mb-8">
        <Image src="/brand/hf-lockup-header-light.svg" alt="Sample Factory" width={160} height={19} priority className="h-[19px] w-[160px]" />
      </Link>
      <ul className="grid gap-1">
        {items.map(([href, label]) => {
          const active = path === href || path.startsWith(`${href}/`)
          return (
            <li key={href}>
              <Link
                href={href}
                className="hf-ui block rounded-md px-3 py-2 text-[13px] uppercase"
                style={active ? { background: 'var(--hf-oxblood-lit)', color: 'var(--hf-paper)' } : { color: 'var(--hf-ink)' }}
              >
                <NavLabel label={label} />
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
