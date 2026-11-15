import { measureWithin, type PieceEventType, type Stage } from '@hf/domain'
import { Badge } from '@/components/shadcn/badge'
import { formatMeasureRange } from '@/components/checklists/measure-format'

export type ChecklistRecordShape = {
  checklistNumber: number
  answers: Array<{ kind: string; textEn: string; textHi: string; value: boolean | number; unit?: string; min?: number | null; max?: number | null; materials?: Array<{ code: string; qty: number; unit: string }> }>
}

/** The floor step a gated event type stands for, for the "Checked by ... · <step> checklist" header. */
const STEP_FOR_EVENT: Partial<Record<PieceEventType, string>> = {
  PIECE_ACTIVATED: 'activate',
  STAGE_QA_PASSED: 'qa',
  STAGE_QA_FAILED: 'qa',
  ISSUED: 'issue',
  RECEIVED: 'receive',
  PACKED: 'pack',
  SHIPPED: 'ship',
}

/** The six event types the floor gates behind a checklist — used to decide when a missing checklist is worth calling out. */
export const GATED_EVENT_TYPES: ReadonlySet<PieceEventType> = new Set(Object.keys(STEP_FOR_EVENT) as PieceEventType[])

export const stepForEvent = (eventType: PieceEventType): string | null => STEP_FOR_EVENT[eventType] ?? null

/**
 * The checklist an event carried, as ticks — not the JSON `detailEntries`
 * would otherwise dump. The office reads English only, so the tick text
 * stays a plain server component: no `useT`, no client boundary. The header
 * names who signed and for which step, since that is the point of showing it.
 */
export function ChecklistAnswers({ record, by, eventType, stage }: { record: ChecklistRecordShape; by: string; eventType: PieceEventType; stage: Stage | null }) {
  const step = stepForEvent(eventType)
  return (
    <div className="mt-2 grid gap-1 text-sm">
      <p style={{ color: 'var(--hf-muted)' }}>
        Checked by {by}{step && <> · {step}{stage && <> · {stage}</>} checklist v{record.checklistNumber}</>}
      </p>
      <ul className="grid gap-1">
        {record.answers.map((a, i) => {
          const isMeasure = typeof a.value === 'number'
          const outOfRange = isMeasure && !measureWithin(a.value as number, a.min ?? null, a.max ?? null)
          return (
            <li key={i} className="flex items-start gap-2">
              <Badge variant="outline" className="mt-0.5">✓</Badge>
              <span>
                {a.textEn} <span lang="hi" style={{ color: 'var(--hf-muted)' }}>· {a.textHi}</span>
                {isMeasure && (
                  <span
                    className="ml-1"
                    style={outOfRange ? { color: 'var(--hf-oxblood-deep)' } : undefined}
                    title={outOfRange ? 'outside the allowed range' : undefined}
                  >
                    {a.value} {a.unit ?? ''}
                    {(a.min != null || a.max != null) && <span style={{ color: outOfRange ? undefined : 'var(--hf-muted)' }}> ({formatMeasureRange(a.min, a.max, null)})</span>}
                  </span>
                )}
                {a.materials && <span className="block text-xs" style={{ color: 'var(--hf-muted)' }}>{a.materials.map((m) => `${m.code} × ${m.qty} ${m.unit}`).join(', ')}</span>}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
