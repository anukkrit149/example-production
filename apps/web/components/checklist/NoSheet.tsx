'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { Stage } from '@hf/domain'
import type { PieceView, ResolvedChecklist } from '@hf/server'
import { mutate } from '@/lib/client-mutate'
import { PhotoCapture } from '@/components/PhotoCapture'
import { TextField } from '@/components/TextField'
import { useT } from '@/lib/i18n/useT'
import { answersPayload, attachmentIds, type Answer, type PhotoMap, type StepAction } from '@/lib/checklist-client'

const DEFECTS = ['MISSING_PANEL', 'CUT_SHORT', 'SHADE_MISMATCH', 'SCRATCH', 'STITCH_SKIP', 'GLUE_MARK', 'OTHER'] as const

/**
 * What a NO leads to. Every exit here is a move the state allows; `view.actions`
 * is the authority.
 *
 * `startMode` opens the sheet straight into `fail`, skipping the menu — the
 * summary's own Reject button on a QA step already knows that is where it is
 * going, and it carries the answers so far: a fail keeps them as evidence of
 * what was measured, not certified against the range, which is why the
 * checklist gate does not enforce it here.
 */
export function NoSheet({
  view,
  action,
  stage,
  onClose,
  startMode = 'menu',
  answers,
  checklist,
  photos: answerPhotos,
}: {
  view: PieceView
  action: StepAction
  stage: Stage | null
  onClose: () => void
  startMode?: 'menu' | 'fail'
  answers?: Record<string, Answer>
  checklist?: ResolvedChecklist | null
  photos?: PhotoMap
}) {
  const { t } = useT()
  const router = useRouter()
  const [mode, setMode] = useState<'menu' | 'hold' | 'fail'>(startMode)
  const [reason, setReason] = useState('')
  const [defects, setDefects] = useState<string[]>([])
  const [photos, setPhotos] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /* Hold is evidence too, like every other required photo: reason and photo both required, submit disabled until both. */
  const hold = async () => {
    setBusy(true); setError(null)
    try { await mutate(`/api/pieces/${view.id}/hold`, { reason, expectedVersion: view.version, attachmentIds: photos }); router.push(`/pieces/${view.id}`) }
    catch (e) { setError(e instanceof Error ? e.message : t('network')) } finally { setBusy(false) }
  }
  /*
   * A fail is evidence, so it carries a photo like every other QA record: the
   * photo policy makes STAGE_QA_FAILED required, and a phone that posted
   * without one would only learn that from a 422 after the operator had
   * already put the piece down. When answers arrived from the summary (a
   * Reject rather than a mid-flow NO), the checklist is attached too, so the
   * values behind the failure are kept.
   */
  const fail = async () => {
    setBusy(true); setError(null)
    try {
      const cl = checklist && answers ? answersPayload(checklist.id, Object.values(answers)) : undefined
      const combinedPhotos = answerPhotos ? [...new Set([...attachmentIds(answerPhotos), ...photos])] : photos
      await mutate(`/api/pieces/${view.id}/qa`, { stage, result: 'fail', defectCodes: defects, notes: reason.trim() || undefined, attachmentIds: combinedPhotos, expectedVersion: view.version, ...(cl ? { checklist: cl } : {}) })
      router.push(`/pieces/${view.id}`)
    }
    catch (e) { setError(e instanceof Error ? e.message : t('network')) } finally { setBusy(false) }
  }
  const BTN = 'hf-ui flex min-h-14 w-full items-center justify-center rounded-lg border-2 px-4 text-base uppercase disabled:opacity-50'
  return (
    <div role="dialog" aria-modal="true" aria-label={t('what_is_wrong')} className="fixed inset-x-0 bottom-0 z-20 mx-auto grid max-w-md gap-3 rounded-t-2xl border-t p-4" style={{ background: 'var(--hf-paper)', borderColor: 'var(--hf-line)' }}>
      <h2 className="hf-display text-xl">{t('what_is_wrong')}</h2>
      {mode === 'menu' && (
        <>
          {action === 'submit_qa' && view.actions.includes('submit_qa') && <button type="button" onClick={() => setMode('fail')} className={BTN} style={{ borderColor: 'var(--hf-stage-pasting)', color: 'var(--hf-stage-pasting)', background: 'var(--hf-card)' }}>{t('fail_check')}</button>}
          {view.actions.includes('hold') && <button type="button" onClick={() => setMode('hold')} className={BTN} style={{ borderColor: 'var(--hf-line)', background: 'var(--hf-card)' }}>{t('put_on_hold')}</button>}
          {view.actions.includes('reject') && <Link href={`/pieces/${view.id}/reject`} className={BTN} style={{ borderColor: 'var(--hf-oxblood-deep)', color: 'var(--hf-oxblood-deep)', background: 'var(--hf-card)' }}>{t('reject_piece')}</Link>}
          <button type="button" onClick={onClose} className={BTN} style={{ borderColor: 'var(--hf-line)', background: 'transparent' }}>{t('back')}</button>
        </>
      )}
      {mode === 'fail' && (
        <>
          <div className="flex flex-wrap gap-2">{DEFECTS.map((d) => <button key={d} type="button" aria-pressed={defects.includes(d)} onClick={() => setDefects((x) => x.includes(d) ? x.filter((y) => y !== d) : [...x, d])} className="hf-ui min-h-12 rounded-full border-2 px-4 text-sm uppercase" style={defects.includes(d) ? { background: 'var(--hf-stage-pasting)', borderColor: 'var(--hf-stage-pasting)', color: '#fff' } : { borderColor: 'var(--hf-line)', background: 'var(--hf-card)' }}>{d.replace('_', ' ')}</button>)}</div>
          <TextField label={t('reason')} value={reason} onChange={setReason} maxLength={500} placeholder={t('say_what_happened')} />
          <PhotoCapture value={photos} onChange={setPhotos} required />
          <button type="button" disabled={busy || photos.length === 0 || (defects.length === 0 && !reason.trim())} onClick={fail} className={BTN} style={{ background: 'var(--hf-stage-pasting)', borderColor: 'var(--hf-stage-pasting)', color: '#fff' }}>{busy ? t('saving') : t('fail_check')}</button>
          <button type="button" onClick={startMode === 'fail' ? onClose : () => setMode('menu')} className="hf-ui text-base underline">{t('back')}</button>
        </>
      )}
      {mode === 'hold' && (
        <>
          <TextField label={t('reason')} value={reason} onChange={setReason} maxLength={200} placeholder={t('say_what_happened')} />
          <PhotoCapture value={photos} onChange={setPhotos} required />
          <button type="button" disabled={busy || !reason.trim() || photos.length === 0} onClick={hold} className={BTN} style={{ background: 'var(--hf-oxblood-lit)', borderColor: 'var(--hf-oxblood-lit)', color: 'var(--hf-paper)' }}>{busy ? t('saving') : t('put_on_hold')}</button>
          <button type="button" onClick={() => setMode('menu')} className="hf-ui text-base underline">{t('back')}</button>
        </>
      )}
      {error && <p role="alert" className="font-semibold" style={{ color: 'var(--hf-oxblood-deep)' }}>{error}</p>}
    </div>
  )
}
