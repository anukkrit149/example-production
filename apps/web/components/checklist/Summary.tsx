'use client'

import Link from 'next/link'
import { useState } from 'react'
import { measureWithin, WORKER_TYPE_FOR_STAGE, type CustodyStage, type Stage } from '@hf/domain'
import type { PieceView, ResolvedChecklist, ResolvedItem } from '@hf/server'
import { TextField } from '@/components/TextField'
import { WorkerPicker } from '@/components/WorkerPicker'
import { useT } from '@/lib/i18n/useT'
import type { Answer, PhotoMap, StepAction } from '@/lib/checklist-client'
import { formatMeasureValue } from '@/lib/measure-format'
import type { SignedBy } from './ChecklistStepper'
import { NoSheet } from './NoSheet'

export type SummaryFields = {
  leatherLot: string
  notes: string
  workerId: string
  carton: string
  shortage: string
}

const LABEL = 'hf-label text-[10px]'
const BIG = 'hf-ui flex min-h-16 w-full items-center justify-center rounded-xl border-2 px-4 text-xl uppercase disabled:opacity-50'

const isCustody = (s: Stage | null): s is CustodyStage =>
  s === 'pasting' || s === 'stitching' || s === 'finishing'

/**
 * Everything the operator just said yes to, on one screen, with the fields the
 * action itself needs underneath.
 *
 * The ticks are not decoration: between the last item screen and the post the
 * operator has one chance to notice they confirmed the wrong bundle, and a
 * list of what they agreed to is what makes that possible. The one write
 * button on this screen — **Approve** for a QA step, **CONFIRM** for every
 * other action — is the only thing that writes anything.
 */
export function Summary({
  action,
  stage,
  items,
  answers,
  fields,
  onFields,
  busy,
  error,
  conflict,
  onConfirm,
  onBack,
  backHref,
  signedBy,
  view,
  checklist,
  photos,
}: {
  action: StepAction
  stage: Stage | null
  items: ResolvedItem[]
  answers: Record<string, Answer>
  fields: SummaryFields
  onFields: (f: SummaryFields) => void
  busy: boolean
  error: string | null
  conflict: boolean
  onConfirm: () => void
  onBack: () => void
  backHref: string
  signedBy: SignedBy
  view: PieceView
  checklist: ResolvedChecklist | null
  photos: PhotoMap
}) {
  const { t, pick } = useT()
  const set = (patch: Partial<SummaryFields>) => onFields({ ...fields, ...patch })
  const [rejecting, setRejecting] = useState(false)

  const isQa = action === 'submit_qa'
  const needsWorker = action === 'issue' || action === 'receive'
  const approveBlocked = items.some((i) => {
    const v = answers[i.id]?.value
    return i.kind === 'measure' && typeof v === 'number' && !measureWithin(v, i.min, i.max)
  })
  const ready =
    !busy &&
    items.every((i) => answers[i.id]) &&
    (action !== 'activate' || fields.leatherLot.trim().length > 0) &&
    (!needsWorker || fields.workerId !== '') &&
    (action !== 'pack' || fields.carton.trim().length > 0) &&
    (!isQa || !approveBlocked)

  return (
    <section className="grid gap-5">
      <h2 className="hf-display text-xl">{isQa ? t('all_questions') : t('summary')}</h2>

      <ul className="grid gap-2">
        {items.map((i) => (
          <li
            key={i.id}
            className="flex items-start gap-3 rounded-lg border p-3"
            style={{ borderColor: 'var(--hf-line)', background: 'var(--hf-card)' }}
          >
            <AnswerMark item={i} answer={answers[i.id]} />
            <span className="min-w-0 text-lg leading-snug">
              {pick(i.textEn, i.textHi)}
              <AnswerDetail item={i} answer={answers[i.id]} />
            </span>
          </li>
        ))}
      </ul>

      {action === 'activate' && (
        <>
          <TextField
            label={t('leather_lot')}
            value={fields.leatherLot}
            onChange={(leatherLot) => set({ leatherLot })}
            maxLength={64}
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
          />
          <NotesField value={fields.notes} onChange={(notes) => set({ notes })} />
        </>
      )}

      {action === 'submit_qa' && <NotesField value={fields.notes} onChange={(notes) => set({ notes })} />}

      {needsWorker && (
        <section className="grid gap-2">
          <h3 className={LABEL} style={{ color: 'var(--hf-muted)' }}>{t('worker')}</h3>
          {isCustody(stage) ? (
            <WorkerPicker
              type={WORKER_TYPE_FOR_STAGE[stage]}
              value={fields.workerId}
              onChange={(workerId) => set({ workerId })}
            />
          ) : (
            <p role="alert" className="text-base font-semibold" style={{ color: 'var(--hf-oxblood-deep)' }}>
              {t('no_actions')}
            </p>
          )}
        </section>
      )}

      {action === 'receive' && (
        <TextField
          label={t('shortage')}
          value={fields.shortage}
          onChange={(shortage) => set({ shortage })}
          maxLength={200}
        />
      )}

      {action === 'pack' && (
        <TextField
          label={t('carton')}
          value={fields.carton}
          onChange={(v) => set({ carton: v.toUpperCase() })}
          maxLength={32}
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
        />
      )}

      <p className="text-base" style={{ color: 'var(--hf-muted)' }}>
        {t('signed_off_by')} {signedBy.name} · {signedBy.role}
      </p>

      {isQa ? (
        <div className="grid gap-3">
          <button
            type="button"
            onClick={onConfirm}
            disabled={!ready}
            className={BIG}
            style={{ background: 'var(--hf-stage-finishing)', borderColor: 'var(--hf-stage-finishing)', color: '#fff' }}
          >
            {busy ? t('saving') : t('approve')}
          </button>
          {approveBlocked && (
            <p role="alert" className="text-base font-semibold" style={{ color: 'var(--hf-oxblood-deep)' }}>
              {t('approve_blocked_measure')}
            </p>
          )}
          <button
            type="button"
            onClick={() => setRejecting(true)}
            className={`${BIG} min-h-14 text-lg`}
            style={{ background: 'transparent', borderColor: 'var(--hf-oxblood-deep)', color: 'var(--hf-oxblood-deep)' }}
          >
            {t('reject')}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={onConfirm}
          disabled={!ready}
          className={BIG}
          style={{
            background: 'var(--hf-oxblood-lit)',
            borderColor: 'var(--hf-oxblood-lit)',
            color: 'var(--hf-paper)',
          }}
        >
          {busy ? t('saving') : t('confirm')}
        </button>
      )}

      {error && (
        <p role="alert" className="text-base font-semibold" style={{ color: 'var(--hf-oxblood-deep)' }}>
          {error}{' '}
          {conflict && (
            <Link href="/scan" className="underline">
              {t('nav_scan')}
            </Link>
          )}
        </p>
      )}

      <div className="flex items-center justify-between">
        <button type="button" onClick={onBack} className="hf-ui text-base underline" style={{ color: 'var(--hf-muted)' }}>
          {t('back')}
        </button>
        <Link href={backHref} className="hf-ui text-base underline" style={{ color: 'var(--hf-muted)' }}>
          {t('go_back')}
        </Link>
      </div>

      {rejecting && (
        <NoSheet
          view={view}
          action={action}
          stage={stage}
          onClose={() => setRejecting(false)}
          startMode="fail"
          answers={answers}
          checklist={checklist}
          photos={photos}
        />
      )}
    </section>
  )
}

function NotesField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useT()
  return <TextField label={t('notes')} value={value} onChange={onChange} maxLength={500} />
}

/**
 * The mark beside each row: a tick for everything that passed, oxblood for a
 * measurement outside its range. The out-of-range item still has an answer —
 * this is not "unanswered", it is "answered, and worth a second look".
 */
function AnswerMark({ item, answer }: { item: ResolvedItem; answer: Answer | undefined }) {
  const outOfRange = item.kind === 'measure' && typeof answer?.value === 'number' && !measureWithin(answer.value, item.min, item.max)
  return outOfRange ? <OutOfRangeMark /> : <Tick />
}

/** What was said, printed after the item's own sentence: the value with its unit, "Photo", or the materials lines. */
function AnswerDetail({ item, answer }: { item: ResolvedItem; answer: Answer | undefined }) {
  const { t } = useT()
  if (!answer) return null
  if (item.kind === 'measure' && typeof answer.value === 'number') {
    const outOfRange = !measureWithin(answer.value, item.min, item.max)
    return (
      <span className="block text-base" style={outOfRange ? { color: 'var(--hf-oxblood-deep)' } : { color: 'var(--hf-muted)' }}>
        {formatMeasureValue(answer.value, item.unit)}
      </span>
    )
  }
  if (item.kind === 'photo') {
    return <span className="block text-base" style={{ color: 'var(--hf-muted)' }}>{t('photo_taken')}</span>
  }
  if (item.kind === 'materials' && answer.materials?.length) {
    return (
      <span className="block text-base" style={{ color: 'var(--hf-muted)' }}>
        {answer.materials.map((m) => `${m.code} × ${m.qty} ${m.unit}`).join(', ')}
      </span>
    )
  }
  return null
}

function Tick() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="shrink-0" style={{ color: 'var(--hf-stage-finishing)' }}>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.8" />
      <path d="m7.5 12.3 3 3 6-6.6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function OutOfRangeMark() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="shrink-0" style={{ color: 'var(--hf-oxblood-deep)' }}>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 7v6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="12" cy="16.2" r="1.15" fill="currentColor" />
    </svg>
  )
}
