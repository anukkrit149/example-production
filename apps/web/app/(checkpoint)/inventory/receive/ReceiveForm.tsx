'use client'
import Link from 'next/link'
import { useCallback, useMemo, useState } from 'react'
import type { SuggestAudit } from '@hf/contracts'
import type { ReceiptView } from '@hf/server'
import { ItemChips } from '@/components/inventory/ItemChips'
import { PurposePhoto } from '@/components/inventory/PurposePhoto'
import { StepFrame } from '@/components/StepFrame'
import { TextField } from '@/components/TextField'
import { mutate, MutateError } from '@/lib/client-mutate'
import { suggest, type ItemRow, type PhotoPurpose } from '@/lib/inventory-client'
import { useT } from '@/lib/i18n/useT'

/** A suggested item is pre-ticked only when the model is at least this sure. */
const THRESHOLD = 0.6
const TOTAL_STEPS = 6
const CONFIRM = 'hf-ui flex min-h-14 w-full items-center justify-center rounded-lg border-2 px-4 text-base uppercase disabled:opacity-50'
const NEXT = 'hf-ui flex min-h-16 w-full items-center justify-center rounded-xl border-2 text-xl uppercase disabled:opacity-50'

/** Everything the six steps read and write. One object, not step-local state, so a late suggestion still lands correctly no matter which step the person is on, and Back never loses anything. */
type State = {
  step: number
  photos: Record<PhotoPurpose, string[]>
  picked: Set<string>
  suggested: Set<string>
  expected: Record<string, number>
  supplier: string
  reference: string
  location: string
  reading: Partial<Record<PhotoPurpose, boolean>>
  noSuggestion: Partial<Record<PhotoPurpose, boolean>>
  audit: SuggestAudit
}

const initialState: State = {
  step: 0,
  photos: { goods: [], place: [], document: [] },
  picked: new Set(),
  suggested: new Set(),
  expected: {},
  supplier: '',
  reference: '',
  location: '',
  reading: {},
  noSuggestion: {},
  audit: {},
}

/**
 * Six one-job-per-screen steps built on `StepFrame`: goods photo, place photo
 * + shelf, receipt photo, item chips, supplier + reference, review. The goods
 * and document photos each ask the server for a suggestion the moment they
 * land; whatever comes back updates the one state object directly, so it
 * still applies correctly however many steps the person has since moved
 * past. What was suggested rides along in `suggestions` so the event keeps
 * it next to what was confirmed.
 */
export function ReceiveForm({ items }: { items: ItemRow[] }) {
  const { t, pick } = useT()
  const byCode = useMemo(() => new Map(items.map((i) => [i.code, i])), [items])
  const [state, setState] = useState<State>(initialState)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<ReceiptView | null>(null)

  const onNewPhoto = useCallback(async (purpose: PhotoPurpose, id: string) => {
    if (purpose === 'place') return
    setState((s) => ({ ...s, reading: { ...s.reading, [purpose]: true }, noSuggestion: { ...s.noSuggestion, [purpose]: false } }))
    const out = await suggest(id, purpose)
    setState((s) => {
      const reading = { ...s.reading, [purpose]: false }
      if (!out.available) return { ...s, reading, noSuggestion: { ...s.noSuggestion, [purpose]: true } }
      if (out.kind === 'goods') {
        const ids = out.items.filter((i) => i.confidence >= THRESHOLD).flatMap((i) => { const it = byCode.get(i.code); return it ? [it.id] : [] })
        const audit: SuggestAudit = { ...s.audit, goods: { items: out.items } }
        if (ids.length === 0) return { ...s, reading, audit, noSuggestion: { ...s.noSuggestion, [purpose]: true } }
        return { ...s, reading, audit, picked: new Set([...s.picked, ...ids]), suggested: new Set([...s.suggested, ...ids]) }
      }
      const audit: SuggestAudit = { ...s.audit, document: out.document }
      const matched = out.document.lines.flatMap((l) => { const it = l.code ? byCode.get(l.code) : undefined; return it ? [{ id: it.id, quantity: l.quantity }] : [] })
      const supplier = out.document.supplier ? s.supplier || out.document.supplier : s.supplier
      const reference = out.document.reference ? s.reference || out.document.reference : s.reference
      if (matched.length === 0) return { ...s, reading, audit, supplier, reference, noSuggestion: { ...s.noSuggestion, [purpose]: true } }
      const expected = { ...s.expected }
      for (const m of matched) if (m.quantity !== null) expected[m.id] = m.quantity
      return { ...s, reading, audit, supplier, reference, expected, picked: new Set([...s.picked, ...matched.map((m) => m.id)]), suggested: new Set([...s.suggested, ...matched.map((m) => m.id)]) }
    })
  }, [byCode])

  // Each purpose keeps only the last captured attachment id — PhotoCapture's
  // own `value`/`previews` still track every shot taken this screen, but the
  // receipt only ever needs the most recent one per purpose.
  const setPhoto = (purpose: PhotoPurpose, ids: string[]) => setState((s) => ({ ...s, photos: { ...s.photos, [purpose]: ids.slice(-1) } }))
  const toggle = (id: string) => setState((s) => { const n = new Set(s.picked); if (n.has(id)) n.delete(id); else n.add(id); return { ...s, picked: n } })
  const goBack = () => setState((s) => ({ ...s, step: s.step - 1 }))
  const goNext = () => setState((s) => ({ ...s, step: s.step + 1 }))

  const canNext = [
    state.photos.goods.length > 0,
    state.photos.place.length > 0,
    state.photos.document.length > 0,
    state.picked.size > 0,
    true,
  ][state.step]

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await mutate<{ receipt: ReceiptView }>('/api/inventory/receipts', {
        items: [...state.picked].map((id) => ({ itemId: id, ...(state.expected[id] !== undefined ? { expectedQty: state.expected[id] } : {}) })),
        photos: state.photos,
        supplier: state.supplier || undefined, reference: state.reference || undefined, location: state.location || undefined,
        ...(state.audit.goods || state.audit.document ? { suggestions: state.audit } : {}),
      })
      setDone(res.receipt)
    } catch (e) {
      setError(e instanceof MutateError ? e.message : t('action_failed'))
    } finally {
      setBusy(false)
    }
  }

  const reset = () => { setState(initialState); setError(null); setDone(null) }

  if (done) {
    return (
      <div className="grid gap-4">
        <h1 className="hf-display text-2xl">{t('inv_recorded_title')}</h1>
        <p className="text-lg" style={{ color: 'var(--hf-muted)' }}>{t('inv_recorded_hint')}</p>
        <p className="font-mono text-base">{done.lines.map((l) => l.code).join(' · ')}</p>
        <button type="button" onClick={reset} className={CONFIRM} style={{ background: 'var(--hf-oxblood-lit)', borderColor: 'var(--hf-oxblood-lit)', color: 'var(--hf-paper)' }}>{t('inv_another')}</button>
        <Link href="/inventory" className={CONFIRM} style={{ borderColor: 'var(--hf-line)', color: 'var(--hf-ink)' }}>{t('back')}</Link>
        <Link href="/home" className={CONFIRM} style={{ borderColor: 'var(--hf-line)', color: 'var(--hf-ink)' }}>{t('nav_home')}</Link>
      </div>
    )
  }

  const nextButton = (
    <button type="button" disabled={!canNext} onClick={goNext} className={NEXT} style={{ background: 'var(--hf-oxblood-lit)', borderColor: 'var(--hf-oxblood-lit)', color: 'var(--hf-paper)' }}>
      {t('next_btn')}
    </button>
  )

  switch (state.step) {
    case 0:
      return (
        <StepFrame key="step-0" index={0} total={TOTAL_STEPS} pictogram="delivery-goods" title={t('inv_step_goods')}>
          <PurposePhoto purpose="goods" label={t('inv_photo_goods')} value={state.photos.goods} onChange={(ids) => setPhoto('goods', ids)} onNew={(id) => onNewPhoto('goods', id)} reading={state.reading.goods} noSuggestion={state.noSuggestion.goods} />
          {nextButton}
        </StepFrame>
      )
    case 1:
      return (
        <StepFrame key="step-1" index={1} total={TOTAL_STEPS} pictogram="shelf" title={t('inv_step_place')} onBack={goBack}>
          <PurposePhoto purpose="place" label={t('inv_photo_place')} value={state.photos.place} onChange={(ids) => setPhoto('place', ids)} />
          <TextField label={t('inv_shelf')} value={state.location} onChange={(v) => setState((s) => ({ ...s, location: v }))} maxLength={60} />
          {nextButton}
        </StepFrame>
      )
    case 2:
      return (
        <StepFrame key="step-2" index={2} total={TOTAL_STEPS} pictogram="receipt-paper" title={t('inv_step_document')} onBack={goBack}>
          <PurposePhoto purpose="document" label={t('inv_photo_document')} value={state.photos.document} onChange={(ids) => setPhoto('document', ids)} onNew={(id) => onNewPhoto('document', id)} reading={state.reading.document} noSuggestion={state.noSuggestion.document} />
          {nextButton}
        </StepFrame>
      )
    case 3:
      return (
        <StepFrame key="step-3" index={3} total={TOTAL_STEPS} pictogram="chips" title={t('inv_step_items')} onBack={goBack}>
          <ItemChips items={items} picked={state.picked} suggested={state.suggested} expected={state.expected} onToggle={toggle} />
          {state.picked.size === 0 && <p className="text-base" style={{ color: 'var(--hf-muted)' }}>{t('inv_pick_one')}</p>}
          {nextButton}
        </StepFrame>
      )
    case 4:
      return (
        <StepFrame key="step-4" index={4} total={TOTAL_STEPS} pictogram="supplier" title={t('inv_step_details')} onBack={goBack}>
          <TextField label={t('inv_supplier')} value={state.supplier} onChange={(v) => setState((s) => ({ ...s, supplier: v }))} maxLength={120} />
          <TextField label={t('inv_reference')} value={state.reference} onChange={(v) => setState((s) => ({ ...s, reference: v }))} maxLength={60} mono />
          {nextButton}
        </StepFrame>
      )
    default: {
      const picked = items.filter((i) => state.picked.has(i.id))
      const photoCount = state.photos.goods.length + state.photos.place.length + state.photos.document.length
      return (
        <StepFrame key="step-5" index={5} total={TOTAL_STEPS} pictogram="inspect" title={t('inv_step_review')} onBack={goBack}>
          <div className="grid w-full gap-4">
            <p className="text-lg">{t('inv_n_photos', { n: photoCount })}</p>
            <ul className="grid gap-1 text-lg">
              {picked.map((i) => (
                <li key={i.id}>
                  <span className="font-mono font-semibold">{i.code}</span> — {pick(i.nameEn, i.nameHi)}
                  {state.expected[i.id] !== undefined && <span> · {t('inv_receipt_says', { n: state.expected[i.id]! })}</span>}
                </li>
              ))}
            </ul>
            <p className="text-lg">{state.supplier || '—'}{state.reference ? ` · ${state.reference}` : ''}</p>
          </div>
          <button type="button" onClick={submit} disabled={busy} className={CONFIRM} style={{ background: 'var(--hf-oxblood-lit)', borderColor: 'var(--hf-oxblood-lit)', color: 'var(--hf-paper)' }}>
            {busy ? t('saving') : t('confirm')}
          </button>
          {error && <p role="alert" className="text-base font-semibold" style={{ color: 'var(--hf-oxblood-deep)' }}>{error}</p>}
        </StepFrame>
      )
    }
  }
}
