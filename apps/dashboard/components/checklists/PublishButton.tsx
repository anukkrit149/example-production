'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { mutate, MutateError } from '@/lib/client-mutate'
import { Button } from '../ui'

export function PublishButton({ id, nextNumber }: { id: string; nextNumber: number }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const publish = async () => {
    setBusy(true); setError(null)
    try {
      await mutate(`/api/checklists/${id}/publish`, {})
      router.push(`/checklists/${id}`)
      router.refresh()
    } catch (e) {
      setError(e instanceof MutateError ? e.message : 'Something went wrong. Try again.')
      setBusy(false)
    }
  }
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={publish} disabled={busy}>{busy ? 'Publishing…' : `Publish version ${nextNumber}`}</Button>
        <span className="text-sm" style={{ color: 'var(--hf-muted)' }}>Goes live for the floor on the next scan.</span>
      </div>
      {error && <p role="alert" className="text-sm font-semibold" style={{ color: 'var(--hf-oxblood-deep)' }}>{error}</p>}
    </div>
  )
}
