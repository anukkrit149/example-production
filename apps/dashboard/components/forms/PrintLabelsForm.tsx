'use client'
import { useRouter } from 'next/navigation'
import { useCallback, useState } from 'react'
import { MutateError, mutate } from '@/lib/client-mutate'
import { Button, Field, inputClass } from '../ui'

type Scope = { lineItemId: string } | { orderId: string }

/**
 * Two steps in one drawer: download the file, then confirm the printer
 * actually produced it. The batch id from the export response is what makes
 * "mark printed" possible — nothing is stamped just because a file went out,
 * matching the phone's print queue (`apps/web/app/(checkpoint)/print-queue`).
 */
export function PrintLabelsForm({ scope, pending }: { scope: Scope; pending: number }) {
  const router = useRouter()
  const [format, setFormat] = useState<'csv' | 'xlsx'>('xlsx')
  const [batch, setBatch] = useState<{ id: string; count: number } | null>(null)
  const [copies, setCopies] = useState('1')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const download = useCallback(async () => {
    setBusy(true)
    setError(null)
    let res: Response
    try {
      res = await fetch('/api/labels/export', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'planned', format, ...scope }),
      })
    } catch {
      setBusy(false)
      setError('No connection. Try again.')
      return
    }
    if (!res.ok) {
      const e = await res.json().catch(() => ({ error: { message: 'Export failed. Nothing was marked — try again.' } }))
      setBusy(false)
      setError(e.error?.message ?? 'Export failed. Nothing was marked — try again.')
      return
    }
    const disposition = res.headers.get('content-disposition') ?? ''
    const match = /filename="([^"]+)"/.exec(disposition)
    const filename = match ? match[1]! : `labels-planned.${format}`
    const batchId = res.headers.get('x-export-batch-id')
    const blob = await res.blob()
    const href = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = href
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    // Revoked on the next tick, not immediately: some browsers have not
    // finished reading the blob when click() returns.
    setTimeout(() => URL.revokeObjectURL(href), 30_000)
    setBusy(false)
    if (batchId) setBatch({ id: batchId, count: pending })
  }, [format, pending, scope])

  const markPrinted = useCallback(async () => {
    if (!batch) return
    setBusy(true)
    setError(null)
    try {
      await mutate(`/api/labels/${batch.id}/printed`, { copies: Number(copies) || 1 })
    } catch (err) {
      setBusy(false)
      setError(err instanceof MutateError ? err.message : 'Something went wrong. Try again.')
      return
    }
    setBusy(false)
    setBatch(null)
    router.refresh()
  }, [batch, copies, router])

  if (pending === 0 && !batch) {
    return <p className="text-sm" style={{ color: 'var(--hf-muted)' }}>All planned labels printed.</p>
  }

  return (
    <div className="grid gap-4">
      <p className="text-sm" style={{ color: 'var(--hf-muted)' }}>{pending} planned label{pending === 1 ? '' : 's'} pending.</p>

      {!batch && (
        <>
          <Field label="Format">
            <div className="hf-ui flex gap-2 text-xs uppercase" role="tablist" aria-label="Format">
              {(['csv', 'xlsx'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  role="tab"
                  aria-selected={format === f}
                  onClick={() => setFormat(f)}
                  className="h-9 flex-1 rounded-md border px-3"
                  style={{
                    borderColor: format === f ? 'var(--hf-oxblood-lit)' : 'var(--hf-line)',
                    background: format === f ? 'var(--hf-oxblood-lit)' : 'var(--hf-card)',
                    color: format === f ? 'var(--hf-paper)' : 'var(--hf-ink)',
                  }}
                >
                  {f}
                </button>
              ))}
            </div>
          </Field>
          <div className="flex justify-end">
            <Button type="button" onClick={download} disabled={busy || pending === 0}>{busy ? 'Preparing…' : 'Download'}</Button>
          </div>
        </>
      )}

      {batch && (
        <div className="grid gap-3 rounded-lg border-2 p-3" style={{ borderColor: 'var(--hf-oxblood-lit)', background: 'var(--hf-card)' }}>
          <p className="text-sm">Batch of {batch.count} downloaded. Only mark it printed once the labels are actually out of the printer.</p>
          <Field label="Copies"><input type="number" min={1} max={99} className={inputClass} value={copies} onChange={(e) => setCopies(e.target.value)} /></Field>
          <div className="flex justify-end">
            <Button type="button" onClick={markPrinted} disabled={busy}>{busy ? 'Saving…' : 'Mark printed'}</Button>
          </div>
        </div>
      )}

      {error && <p role="alert" className="text-sm font-semibold" style={{ color: 'var(--hf-oxblood-deep)' }}>{error}</p>}
    </div>
  )
}
