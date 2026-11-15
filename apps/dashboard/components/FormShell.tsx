'use client'
import { useRouter } from 'next/navigation'
import { useState, type FormEvent, type ReactNode } from 'react'
import { MutateError } from '@/lib/client-mutate'
import { useDrawer } from './Drawer'
import { Button } from './ui'

/**
 * Busy state, the server's readable error under the fields, then close the
 * drawer and refresh the page's server data on success.
 */
export function FormShell({ onSubmit, submitLabel, children }: { onSubmit: () => Promise<void>; submitLabel: string; children: ReactNode }) {
  const router = useRouter()
  const { close } = useDrawer()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await onSubmit()
      close()
      router.refresh()
    } catch (err) {
      setError(err instanceof MutateError ? err.message : 'Something went wrong. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      {children}
      {error && <p role="alert" className="text-sm font-semibold" style={{ color: 'var(--hf-oxblood-deep)' }}>{error}</p>}
      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="ghost" onClick={close}>Cancel</Button>
        <Button type="submit" disabled={busy}>{busy ? 'Saving…' : submitLabel}</Button>
      </div>
    </form>
  )
}
