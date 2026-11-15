'use client'
import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import { Button } from './ui'

const DrawerContext = createContext<{ close: () => void }>({ close: () => {} })
export const useDrawer = () => useContext(DrawerContext)

const noop = () => () => {}

/**
 * A right-hand panel for forms, so the list stays visible behind it. Children
 * reach `close` through context rather than a render prop: a server component
 * cannot pass a function down to a client component.
 */
export function Drawer({ title, trigger, variant = 'primary', children }: { title: string; trigger: string; variant?: 'primary' | 'ghost'; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const close = () => setOpen(false)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])
  // The trigger is in the server HTML before React attaches `onClick`; a click in
  // that window does nothing, for a user as well as for Playwright. Disabling it
  // until hydration means a click can never land on inert markup — Playwright's
  // actionability check waits for `enabled`, so tests need no sleeps.
  // True only after hydration: the server snapshot is false, the client snapshot true.
  // A click before this flips cannot reach a handler, so the trigger stays disabled until then.
  const mounted = useSyncExternalStore(noop, () => true, () => false)
  return (
    <>
      <Button variant={variant} type="button" disabled={!mounted} onClick={() => setOpen(true)}>{trigger}</Button>
      {open && (
        <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true" aria-label={title}>
          <button type="button" aria-label="Close" className="flex-1 bg-black/20" onClick={close} />
          <aside className="h-full w-full overflow-y-auto border-l p-6 md:w-[440px]" style={{ background: 'var(--hf-paper)', borderColor: 'var(--hf-line)' }}>
            <h2 className="hf-display mb-5 text-xl">{title}</h2>
            <DrawerContext.Provider value={{ close }}>{children}</DrawerContext.Provider>
          </aside>
        </div>
      )}
    </>
  )
}
