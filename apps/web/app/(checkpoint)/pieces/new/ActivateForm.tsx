'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { LineItemSummary } from '@/lib/line-items'
import { useT } from '@/lib/i18n/useT'

/**
 * A panel set came off the table and its planned label is missing or unreadable.
 *
 * The whole screen is one question — which line item was cut — because
 * everything else the activation needs (the lot, the photo, the cutting
 * checks) belongs to the stepper exactly as it does for a scanned label. This
 * screen only resolves which planned piece the bundle becomes: the lowest
 * serial still unspent on that line item. Nothing is written here; the first
 * write happens at the stepper's CONFIRM.
 */
export function ActivateForm({ lineItems }: { lineItems: LineItemSummary[] }) {
  const router = useRouter()
  const { t } = useT()
  const [lineItemId, setLineItemId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    if (!lineItemId || busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/line-items/${lineItemId}/next-planned`)
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error?.message ?? 'no planned piece left on this line item')
      router.push(`/pieces/${data.pieceId}/do/activate`)
    } catch (e) {
      setError(e instanceof Error ? e.message : t('network'))
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-5">
      <h1 className="hf-display text-2xl">{t('activate_without_label')}</h1>

      <section className="grid gap-2">
        <h2 className="hf-label text-[10px]" style={{ color: 'var(--hf-muted)' }}>
          What was cut
        </h2>

        <ul className="grid gap-2">
          {lineItems.map((li) => {
            const picked = li.id === lineItemId
            return (
              <li key={li.id}>
                <button
                  type="button"
                  aria-pressed={picked}
                  onClick={() => setLineItemId(li.id)}
                  className="grid min-h-16 w-full gap-1 rounded-lg border-2 px-4 py-3 text-left"
                  style={{
                    borderColor: picked ? 'var(--hf-oxblood-lit)' : 'var(--hf-line)',
                    background: picked ? 'var(--hf-paper)' : 'var(--hf-card)',
                  }}
                >
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="hf-display text-2xl leading-tight">{li.styleCode}</span>
                    <span className="text-lg font-semibold">
                      {li.size} · {li.shade}
                    </span>
                  </span>
                  <span className="text-base" style={{ color: 'var(--hf-muted)' }}>
                    {li.orderNumber} · {li.programName} · {li.cut} of {li.quantity} cut
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </section>

      <button
        type="button"
        onClick={submit}
        disabled={!lineItemId || busy}
        className="hf-ui flex min-h-14 w-full items-center justify-center rounded-lg border-2 px-4 text-base uppercase disabled:opacity-50"
        style={{
          background: 'var(--hf-oxblood-lit)',
          borderColor: 'var(--hf-oxblood-lit)',
          color: 'var(--hf-paper)',
        }}
      >
        {busy ? t('saving') : t('next')}
      </button>

      {error && (
        <p role="alert" className="text-base font-semibold" style={{ color: 'var(--hf-oxblood-deep)' }}>
          {error}
        </p>
      )}

      <Link href="/scan" className="hf-ui text-base underline" style={{ color: 'var(--hf-muted)' }}>
        {t('cancel')}
      </Link>
    </div>
  )
}
