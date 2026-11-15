'use client'
import { measureWithin } from '@hf/domain'
import { useT } from '@/lib/i18n/useT'
import { formatMeasureValue } from '@/lib/measure-format'

export type ChecklistRecordShape = {
  checklistNumber: number
  answers: Array<{
    kind: string
    textEn: string
    textHi: string
    value: true | number
    unit?: string
    min?: number | null
    max?: number | null
    materials?: Array<{ code: string; qty: number; unit: string }>
  }>
}

/**
 * The checklist an event carried, as ticks — not the JSON `detailEntries`
 * would otherwise dump. `pick` reads the item text in whichever language the
 * operator is holding the phone in; the version number pins exactly which
 * published list this event answered. A `measure` answer shows its value with
 * unit instead of a tick, oxblood when it fell outside the range it carried.
 */
export function ChecklistAnswers({ record }: { record: ChecklistRecordShape }) {
  const { t, pick } = useT()
  return (
    <ul className="mt-2 grid gap-1 text-base">
      <li className="hf-label text-[10px]" style={{ color: 'var(--hf-muted)' }}>{t('summary')} · v{record.checklistNumber}</li>
      {record.answers.map((a, i) => {
        const isMeasure = a.kind === 'measure' && typeof a.value === 'number'
        const outOfRange = isMeasure && !measureWithin(a.value as number, a.min ?? null, a.max ?? null)
        return (
          <li key={i} className="flex items-start gap-2">
            {isMeasure ? (
              <span style={{ color: outOfRange ? 'var(--hf-oxblood-deep)' : 'var(--hf-muted)' }}>
                {formatMeasureValue(a.value as number, a.unit ?? null)}
              </span>
            ) : (
              <span aria-hidden style={{ color: 'var(--hf-stage-finishing)' }}>✓</span>
            )}
            <span>{pick(a.textEn, a.textHi)}{a.materials && <span className="block text-sm" style={{ color: 'var(--hf-muted)' }}>{a.materials.map((m) => `${m.code} × ${m.qty} ${m.unit}`).join(', ')}</span>}</span>
          </li>
        )
      })}
    </ul>
  )
}
