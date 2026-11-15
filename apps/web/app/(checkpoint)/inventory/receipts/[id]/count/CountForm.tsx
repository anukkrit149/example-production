'use client'
import Link from 'next/link'
import { useState } from 'react'
import type { ReceiptView } from '@hf/server'
import { formatKolkata } from '@hf/server/format'
import { ReceiptPhotos } from '@/components/inventory/ReceiptPhotos'
import { TextField } from '@/components/TextField'
import { mutate, MutateError } from '@/lib/client-mutate'
import type { ItemRow } from '@/lib/inventory-client'
import { useT } from '@/lib/i18n/useT'

type Line = { itemId: string; code: string; nameEn: string; nameHi: string; unit: string; expected: string; counted: string; added: boolean }

const CONFIRM = 'hf-ui flex min-h-14 w-full items-center justify-center rounded-lg border-2 px-4 text-base uppercase disabled:opacity-50'
const NUM = 'min-h-14 w-full rounded-lg border-2 px-3 text-center font-mono text-xl'
const inputStyle = { borderColor: 'var(--hf-line)', background: 'var(--hf-paper)', color: 'var(--hf-ink)' } as const

/**
 * The tally. Expected numbers arrive prefilled from the receive step (read off
 * the paper by the photo reader or typed), the store person checks them and
 * types what they counted. An item the receiver missed can be added; nothing
 * can be removed — a missing item is counted 0.
 */
export function CountForm({ receipt, items }: { receipt: ReceiptView; items: ItemRow[] }) {
  const { t, pick } = useT()
  const [lines, setLines] = useState<Line[]>(receipt.lines.map((l) => ({ itemId: l.itemId, code: l.code, nameEn: l.nameEn, nameHi: l.nameHi, unit: l.unit, expected: l.expectedQty === null ? '' : String(l.expectedQty), counted: '', added: false })))
  const [adding, setAdding] = useState(false)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [conflict, setConflict] = useState(false)
  const [done, setDone] = useState<ReceiptView | null>(null)

  const remaining = items.filter((i) => !lines.some((l) => l.itemId === i.id))
  const digits = (s: string) => /^\d+$/.test(s)
  const complete = lines.length > 0 && lines.every((l) => digits(l.counted) && (l.expected === '' || digits(l.expected)))
  const set = (itemId: string, field: 'expected' | 'counted', value: string) =>
    setLines((ls) => ls.map((l) => (l.itemId === itemId ? { ...l, [field]: value.replace(/[^\d]/g, '') } : l)))

  const submit = async () => {
    setBusy(true); setError(null); setConflict(false)
    try {
      const res = await mutate<{ receipt: ReceiptView }>(`/api/inventory/receipts/${receipt.id}/count`, {
        expectedVersion: receipt.version,
        lines: lines.map((l) => ({ itemId: l.itemId, countedQty: Number(l.counted), ...(l.expected !== '' ? { expectedQty: Number(l.expected) } : {}) })),
        note: note || undefined,
      })
      setDone(res.receipt)
    } catch (e) {
      if (e instanceof MutateError && e.status === 409) { setConflict(true); setError(t('inv_already_counted')) }
      else setError(e instanceof MutateError ? e.message : t('action_failed'))
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <div className="grid gap-4">
        <h1 className="hf-display text-2xl">{t('inv_count_done')}</h1>
        {!done.hasDiscrepancy && <p className="text-lg">{t('inv_all_match')}</p>}
        <ul className="grid gap-1 text-lg">
          {done.lines.filter((l) => l.variance !== 0).map((l) => (
            <li key={l.itemId} style={{ color: 'var(--hf-oxblood-deep)' }}>
              {l.variance === null ? t('inv_no_expected', { code: l.code }) : l.variance < 0 ? t('inv_short_by', { code: l.code, n: -l.variance }) : t('inv_over_by', { code: l.code, n: l.variance })}
            </li>
          ))}
        </ul>
        <Link href="/inventory" className={CONFIRM} style={{ background: 'var(--hf-oxblood-lit)', borderColor: 'var(--hf-oxblood-lit)', color: 'var(--hf-paper)' }}>{t('inv_next_to_count')}</Link>
        <Link href="/home" className={CONFIRM} style={{ borderColor: 'var(--hf-line)', color: 'var(--hf-ink)' }}>{t('nav_home')}</Link>
      </div>
    )
  }

  return (
    <div className="grid gap-5">
      <div>
        <h1 className="hf-display text-2xl">{t('inv_count_title')}</h1>
        <p className="text-base" style={{ color: 'var(--hf-muted)' }}>
          {receipt.supplier ?? '—'}{receipt.reference ? ` · ${receipt.reference}` : ''} · {t('inv_received_by')} {receipt.receivedBy} · {formatKolkata(receipt.receivedAt)}
        </p>
      </div>
      <ReceiptPhotos photos={receipt.photos} />

      <ul className="grid gap-3">
        {lines.map((l) => (
          <li key={l.itemId} className="grid gap-2 rounded-lg border p-3" style={{ borderColor: 'var(--hf-line)', background: 'var(--hf-card)' }}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-mono text-base font-semibold">{l.code}</span>
              <span className="text-sm" style={{ color: 'var(--hf-muted)' }}>{pick(l.nameEn, l.nameHi)} · {l.unit}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="grid gap-1">
                <span className="hf-label text-[10px]" style={{ color: 'var(--hf-muted)' }}>{t('inv_expected')}</span>
                <input inputMode="numeric" pattern="[0-9]*" aria-label={`${t('inv_expected')} ${l.code}`} value={l.expected} onChange={(e) => set(l.itemId, 'expected', e.target.value)} className={NUM} style={inputStyle} />
              </label>
              <label className="grid gap-1">
                <span className="hf-label text-[10px]" style={{ color: 'var(--hf-muted)' }}>{t('inv_counted')}</span>
                <input inputMode="numeric" pattern="[0-9]*" aria-label={`${t('inv_counted')} ${l.code}`} value={l.counted} onChange={(e) => set(l.itemId, 'counted', e.target.value)} className={NUM} style={{ ...inputStyle, borderColor: 'var(--hf-oxblood-lit)' }} />
              </label>
            </div>
          </li>
        ))}
      </ul>

      {remaining.length > 0 && !adding && (
        <button type="button" onClick={() => setAdding(true)} className={CONFIRM} style={{ borderColor: 'var(--hf-line)', color: 'var(--hf-ink)' }}>{t('inv_add_item')}</button>
      )}
      {adding && (
        <ul className="grid grid-cols-2 gap-2" aria-label={t('inv_add_item')}>
          {remaining.map((i) => (
            <li key={i.id}>
              <button type="button" onClick={() => { setLines((ls) => [...ls, { itemId: i.id, code: i.code, nameEn: i.nameEn, nameHi: i.nameHi, unit: i.unit, expected: '', counted: '', added: true }]); setAdding(false) }}
                className="grid min-h-16 w-full gap-0.5 rounded-lg border-2 px-3 py-2 text-left" style={{ borderColor: 'var(--hf-line)', background: 'var(--hf-card)', color: 'var(--hf-ink)' }}>
                <span className="font-mono text-base font-semibold">{i.code}</span>
                <span className="text-sm">{pick(i.nameEn, i.nameHi)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <TextField label={t('notes')} value={note} onChange={setNote} maxLength={500} />

      <button type="button" onClick={submit} disabled={!complete || busy || conflict} className={CONFIRM} style={{ background: 'var(--hf-oxblood-lit)', borderColor: 'var(--hf-oxblood-lit)', color: 'var(--hf-paper)' }}>
        {busy ? t('saving') : t('confirm')}
      </button>
      {error && (
        <p role="alert" className="text-base font-semibold" style={{ color: 'var(--hf-oxblood-deep)' }}>
          {error} {conflict && <Link href="/inventory" className="underline">{t('back')}</Link>}
        </p>
      )}
    </div>
  )
}
