'use client'
import { useState } from 'react'
import { measureWithin } from '@hf/domain'
import type { ResolvedItem } from '@hf/server'
import { PhotoCapture } from '@/components/PhotoCapture'
import { StepFrame } from '@/components/StepFrame'
import { useT } from '@/lib/i18n/useT'
import type { Answer } from '@/lib/checklist-client'
import { MaterialsItem } from './MaterialsItem'

const BIG = 'hf-ui flex min-h-16 w-full items-center justify-center rounded-xl border-2 text-xl uppercase disabled:opacity-50'
const FIELD = 'min-h-14 w-full rounded-lg border-2 px-3 text-lg'

/**
 * One check, one screen. The pictogram carries the meaning for an operator who
 * does not read either script fluently; the sentence underneath is there for
 * the one who does.
 *
 * A `measure` item swaps YES/NO for a numeric field and a **Next** button —
 * there is no "no" to a measurement, only a number, and whether it is within
 * tolerance is a call the summary makes, not this screen. An out-of-range
 * value still lets the operator move on: it turns the field oxblood and
 * names the rule, but Next stays enabled the moment a number is entered.
 */
export function ItemScreen({ item, index, total, text, answer, onYes, onNo, onBack }: {
  item: ResolvedItem; index: number; total: number; text: string
  answer?: Answer
  onYes: (value: true | number, materials?: Array<{ code: string; qty: number; unit: string }>, photoId?: string) => void
  onNo: () => void; onBack?: () => void; takenById: string
}) {
  const { t } = useT()
  const [photo, setPhoto] = useState<string[]>([])
  const [materials, setMaterials] = useState<Array<{ code: string; qty: number; unit: string }>>([
    { code: 'LIN-01', qty: 1, unit: 'pc' }, { code: 'ZIP-01', qty: 1, unit: 'pc' }, { code: 'THR-01', qty: 1, unit: 'spool' },
  ])
  // Seeded from the answer already on record for this item, so going Back to
  // a measure item after typing a number does not present an empty field —
  // `key={current.id}` in the stepper already remounts this screen per item,
  // which is what makes a lazy initializer here safe and sufficient (no
  // effect needed: the value cannot change again once mounted for this item).
  const [measure, setMeasure] = useState(() => (typeof answer?.value === 'number' ? String(answer.value) : ''))

  if (item.kind === 'measure') {
    const parsed = measure.trim() === '' ? null : Number(measure)
    const ready = parsed !== null && Number.isFinite(parsed)
    const outOfRange = ready && !measureWithin(parsed, item.min, item.max)
    return (
      <StepFrame index={index} total={total} pictogram={item.pictogram} title={text} onBack={onBack}>
        <div className="grid gap-2">
          <div className="flex items-center gap-2">
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              aria-label={text}
              value={measure}
              onChange={(e) => setMeasure(e.target.value)}
              className={FIELD}
              style={{
                borderColor: outOfRange ? 'var(--hf-oxblood-lit)' : 'var(--hf-line)',
                background: 'var(--hf-paper)',
                color: 'var(--hf-ink)',
              }}
            />
            {item.unit && <span className="text-lg" style={{ color: 'var(--hf-muted)' }}>{item.unit}</span>}
          </div>
          {(item.min !== null || item.max !== null) && (
            <p className="text-sm" style={{ color: 'var(--hf-muted)' }}>
              {t('measure_allowed', { min: item.min ?? '…', max: item.max ?? '…', unit: item.unit ?? '' })}
            </p>
          )}
          {outOfRange && (
            <p role="alert" className="text-sm font-semibold" style={{ color: 'var(--hf-oxblood-deep)' }}>
              {t('measure_out_of_range')}
            </p>
          )}
        </div>
        <button
          type="button"
          disabled={!ready}
          onClick={() => onYes(parsed as number)}
          className={BIG}
          style={{ background: 'var(--hf-oxblood-lit)', borderColor: 'var(--hf-oxblood-lit)', color: 'var(--hf-paper)' }}
        >
          {t('next_btn')}
        </button>
      </StepFrame>
    )
  }

  const ready = item.kind === 'photo' ? photo.length > 0 : item.kind === 'materials' ? materials.some((m) => m.code.trim() && m.qty > 0) : true

  return (
    <StepFrame index={index} total={total} pictogram={item.pictogram} title={text} onBack={onBack}>
      {item.kind === 'photo' && <PhotoCapture value={photo} onChange={setPhoto} required />}
      {item.kind === 'materials' && <MaterialsItem value={materials} onChange={setMaterials} />}
      <div className="grid gap-3">
        <button type="button" disabled={!ready} onClick={() => onYes(true, item.kind === 'materials' ? materials.filter((m) => m.code.trim() && m.qty > 0) : undefined, item.kind === 'photo' ? photo[0] : undefined)}
          className={BIG} style={{ background: 'var(--hf-stage-finishing)', borderColor: 'var(--hf-stage-finishing)', color: '#fff' }}>
          {t('yes')}
        </button>
        <button type="button" onClick={onNo} className={`${BIG} min-h-12 text-base`} style={{ background: 'transparent', borderColor: 'var(--hf-line)', color: 'var(--hf-ink)' }}>
          {t('no')}
        </button>
      </div>
    </StepFrame>
  )
}
