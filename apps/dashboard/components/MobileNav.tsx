'use client'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { SignOutButton } from './SignOutButton'
import { navItems } from './Sidebar'

/**
 * The phone shell: lockup and a Menu button in a top bar; the menu is a
 * full-height panel with the same links as the sidebar plus who is signed
 * in. Closes on navigation and on Escape.
 */
export function MobileNav({ isAdmin, name, role, neon }: { isAdmin: boolean; name: string; role: string; neon: boolean }) {
  const path = usePathname()
  const [open, setOpen] = useState(false)
  const [prevPath, setPrevPath] = useState(path)
  if (path !== prevPath) {
    setPrevPath(path)
    setOpen(false)
  }
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])
  return (
    <div className="md:hidden">
      <div className="flex h-12 items-center justify-between border-b px-4" style={{ borderColor: 'var(--hf-line)' }}>
        <Link href="/overview" aria-label="Sample Factory"><Image src="/brand/hf-lockup-header-light.svg" alt="Sample Factory" width={140} height={17} priority className="h-[17px] w-[140px]" /></Link>
        <button type="button" onClick={() => setOpen(true)} aria-expanded={open} className="hf-ui rounded-md border px-3 py-1.5 text-[13px] uppercase" style={{ borderColor: 'var(--hf-line)' }}>Menu</button>
      </div>
      {open && (
        <div className="fixed inset-0 z-40 flex flex-col" role="dialog" aria-modal="true" aria-label="Menu" style={{ background: 'var(--hf-paper)' }}>
          <div className="flex h-12 items-center justify-between border-b px-4" style={{ borderColor: 'var(--hf-line)' }}>
            <span className="text-sm">{name} <span className="hf-label" style={{ color: 'var(--hf-oxblood-lit)' }}>{role}</span></span>
            <button type="button" onClick={() => setOpen(false)} className="hf-ui rounded-md border px-3 py-1.5 text-[13px] uppercase" style={{ borderColor: 'var(--hf-line)' }}>Close</button>
          </div>
          <ul className="grid gap-1 p-4">
            {navItems(isAdmin).map(([href, label]) => {
              const active = path === href || path.startsWith(`${href}/`)
              return (
                <li key={href}>
                  <Link href={href} className="hf-ui block rounded-md px-3 py-3 text-sm uppercase" style={active ? { background: 'var(--hf-oxblood-lit)', color: 'var(--hf-paper)' } : { color: 'var(--hf-ink)' }}>{label}</Link>
                </li>
              )
            })}
          </ul>
          <div className="mt-auto border-t p-4" style={{ borderColor: 'var(--hf-line)' }}><SignOutButton neon={neon} /></div>
        </div>
      )}
    </div>
  )
}
