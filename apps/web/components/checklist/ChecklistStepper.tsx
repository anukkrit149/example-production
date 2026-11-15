'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useMemo, useState, useSyncExternalStore } from 'react'
import type { PieceView, ResolvedChecklist } from '@hf/server'
import type { Stage } from '@hf/domain'
import { mutate, MutateError } from '@/lib/client-mutate'
import { useT } from '@/lib/i18n/useT'
import { answersPayload, attachmentIds, fetchChecklist, stepFor, withPhoto, type Answer, type PhotoMap, type StepAction } from '@/lib/checklist-client'
import { ItemScreen } from './ItemScreen'
import { NoSheet } from './NoSheet'
import { Summary, type SummaryFields } from './Summary'
import { Done } from './Done'
import { ShipDone } from './ShipDone'

const LAST_CARTON = 'hf_last_carton'
/* The key the old activate form wrote, so a bench that already remembers a lot
 * keeps remembering it across this rewrite. */
const LAST_LOT = 'hf.last-lot'

type Phase = { kind: 'item'; index: number } | { kind: 'summary' } | { kind: 'done'; newState: string } | { kind: 'shipped'; shipped: number }

/** The signed-in user, shown on the summary and the Done screen — not chosen. */
export type SignedBy = { name: string; role: string }

/**
 * One check per screen. YES advances, NO opens the exits, the last YES lands
 * on a summary whose single write button (Approve, for a QA step; CONFIRM,
 * for every other) posts everything under one idempotency key. Nothing is
 * written before that post; the server re-checks every answer against the
 * same checklist version.
 */
export function ChecklistStepper({ view, action, stage, checklist: initial, ship, signedBy }: { view: PieceView; action: StepAction; stage: Stage | null; checklist: ResolvedChecklist | null; ship?: { orderId: string; carton: string }; signedBy: SignedBy }) {
  const { t, pick } = useT()
  const router = useRouter()
  const [checklist, setChecklist] = useState(initial)
  /*
   * A published list with no items is legal (nothing to confirm at this step),
   * and the operator should land on the summary rather than a blank screen.
   * That is a property of the list, not an event, so it is the initial phase —
   * setting it from an effect would render the empty item screen first and
   * trip the setState-in-effect rule besides.
   */
  const [phase, setPhase] = useState<Phase>(() => (initial && initial.items.length === 0 ? { kind: 'summary' } : { kind: 'item', index: 0 }))
  const [answers, setAnswers] = useState<Record<string, Answer>>({})
  const [photos, setPhotos] = useState<PhotoMap>({})
  const [noOpen, setNoOpen] = useState(false)
  /*
   * The lot and the carton are remembered because they change when a new hide
   * comes off the shelf or a carton fills, not once per piece — retyping them
   * forty times a shift is forty chances to typo the field a defect is traced
   * by. localStorage is an external store, not React state: read through
   * useSyncExternalStore it is empty on the server and correct on hydration,
   * with no cascading render on mount. `edited` takes over the moment the
   * operator types, including when they clear the field deliberately.
   */
  const remembered = useSyncExternalStore(noopSubscribe, readRemembered, serverRemembered)
  const [edited, setEdited] = useState<Partial<SummaryFields>>({})
  const fields = useMemo<SummaryFields>(() => ({ leatherLot: remembered.leatherLot, notes: '', workerId: '', carton: remembered.carton, shortage: '', ...edited }), [remembered, edited])
  const setFields = useCallback((f: SummaryFields) => setEdited(f), [])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [conflict, setConflict] = useState(false)
  const [key] = useState(() => crypto.randomUUID())

  const items = useMemo(() => checklist?.items ?? [], [checklist])
  const current = phase.kind === 'item' ? items[phase.index] : undefined
  const backHref = action === 'ship' ? '/ship' : `/pieces/${view.id}`

  /*
   * Answering an item is idempotent in every store it touches. An operator who
   * walks back and says YES again — or retakes the shot first, or retypes a
   * measurement — has answered one item once, not twice: the answers map
   * already replaced by item id, and the photo map now does the same, so
   * `attachmentIds` cannot carry a duplicate or a photo the operator
   * discarded.
   */
  const answer = useCallback((value: Answer['value'], materials?: Answer['materials'], photoId?: string) => {
    if (!current) return
    setAnswers((a) => ({ ...a, [current.id]: { itemId: current.id, value, ...(materials ? { materials } : {}) } }))
    setPhotos((p) => withPhoto(p, current.id, photoId))
    setPhase(phase.kind === 'item' && phase.index + 1 < items.length ? { kind: 'item', index: phase.index + 1 } : { kind: 'summary' })
  }, [current, phase, items.length])

  const back = useCallback(() => {
    if (phase.kind === 'item' && phase.index > 0) setPhase({ kind: 'item', index: phase.index - 1 })
    else if (phase.kind === 'summary') setPhase({ kind: 'item', index: Math.max(0, items.length - 1) })
  }, [phase, items.length])

  const endpoint = useMemo(() => (action === 'ship'
    ? (ship ? `/api/cartons/${ship.carton}/ship` : '')
    : ({
        activate: `/api/pieces/${view.id}/activate`, submit_qa: `/api/pieces/${view.id}/qa`, issue: `/api/pieces/${view.id}/issue`,
        receive: `/api/pieces/${view.id}/receive`, pack: `/api/pieces/${view.id}/pack`,
      })[action]
  ), [action, ship, view.id])

  const body = useCallback(() => {
    if (!checklist) return null
    const cl = answersPayload(checklist.id, Object.values(answers))
    if (action === 'ship') {
      if (!ship) return null
      return { orderId: ship.orderId, checklist: cl, attachmentIds: attachmentIds(photos) }
    }
    const base = { checklist: cl, attachmentIds: attachmentIds(photos), expectedVersion: view.version }
    switch (action) {
      case 'activate': return { ...base, leatherLot: fields.leatherLot.trim(), notes: fields.notes.trim() || undefined }
      case 'submit_qa': return { ...base, stage, result: 'pass', defectCodes: [], notes: fields.notes.trim() || undefined }
      case 'issue': return { ...base, stage, workerId: fields.workerId, materials: Object.values(answers).find((a) => a.materials)?.materials ?? [] }
      case 'receive': return { ...base, stage, workerId: fields.workerId, shortage: fields.shortage.trim() || undefined }
      case 'pack': return { ...base, carton: fields.carton.trim() }
    }
  }, [action, answers, checklist, fields, photos, ship, stage, view.version])

  const confirm = useCallback(async () => {
    const b = body()
    if (!b) return
    setBusy(true); setError(null); setConflict(false)
    try {
      if (action === 'ship') {
        const r = await mutate<{ shipped: number; replayed: boolean }>(endpoint, b, { key })
        if (navigator.vibrate) navigator.vibrate(120)
        setPhase({ kind: 'shipped', shipped: r.shipped })
        router.refresh()
        return
      }
      const r = await mutate<{ piece: PieceView }>(endpoint, b, { key })
      if (action === 'pack') writeLast(LAST_CARTON, fields.carton.trim())
      if (action === 'activate') writeLast(LAST_LOT, fields.leatherLot.trim())
      if (navigator.vibrate) navigator.vibrate(120)
      setPhase({ kind: 'done', newState: r.piece.state })
      /*
       * No router.refresh() here. The piece has already moved to its next
       * state, so the server page's `view.actions.includes(action)` guard
       * would fail on re-render and call notFound() — the operator would see
       * a 404 instead of this Done screen. The Done panel is the screen we
       * want; the server-rendered card above it is knowingly stale until the
       * operator scans again.
       */
    } catch (e) {
      if (e instanceof MutateError && e.status === 409) { setConflict(true); setError(t('changed_rescan')) }
      else if (e instanceof MutateError && e.code === 'checklist_stale') {
        setError(t('checklist_changed'))
        const { step, stage: s } = stepFor(action, { stage, nextCustody: stage })
        const fresh = await fetchChecklist(view.id, step, s)
        setChecklist(fresh); setAnswers({}); setPhotos({})
        setPhase(fresh && fresh.items.length === 0 ? { kind: 'summary' } : { kind: 'item', index: 0 })
      } else setError(e instanceof MutateError ? e.message : t('network'))
    } finally { setBusy(false) }
  }, [action, body, endpoint, fields.carton, fields.leatherLot, key, router, stage, t, view.id])

  if (!checklist) return <p role="alert" className="text-lg" style={{ color: 'var(--hf-oxblood-deep)' }}>{t('no_actions')}</p>

  if (phase.kind === 'shipped') return <ShipDone shipped={phase.shipped} />

  if (phase.kind === 'done') return <Done newState={phase.newState} pieceId={view.id} signedBy={signedBy} />

  if (phase.kind === 'summary') {
    return (
      <Summary action={action} stage={stage} items={items} answers={answers} fields={fields} onFields={setFields}
        busy={busy} error={error} conflict={conflict} onConfirm={confirm} onBack={back} backHref={backHref}
        signedBy={signedBy} view={view} checklist={checklist} photos={photos} />
    )
  }

  return (
    <>
      {/*
        * Keyed by item so each check mounts fresh. Without it React reuses the
        * instance across items and the screen's own photo and materials state
        * survives the move — the next item would open holding the last one's
        * thumbnail, and stepping back would show a photo already answered.
        */}
      <ItemScreen
        key={current!.id}
        item={current!} index={phase.index} total={items.length}
        text={pick(current!.textEn, current!.textHi)}
        answer={answers[current!.id]}
        onYes={answer} onNo={() => setNoOpen(true)} onBack={phase.index > 0 ? back : undefined}
        takenById={view.id}
      />
      {noOpen && <NoSheet view={view} action={action} stage={stage} onClose={() => setNoOpen(false)} />}
      <Link href={backHref} className="hf-ui text-base underline" style={{ color: 'var(--hf-muted)' }}>{t('go_back')}</Link>
    </>
  )
}

function readLast(k: string): string { try { return localStorage.getItem(k) ?? '' } catch { /* a private-mode phone still cuts leather; it retypes the lot */ return '' } }
function writeLast(k: string, v: string) { try { localStorage.setItem(k, v) } catch { /* ignore */ } }

/*
 * Nothing in a session writes these keys behind the screen's back, so the
 * store has nothing to publish and the snapshot is read once. It must be the
 * *same* object each call or useSyncExternalStore re-renders forever, so the
 * last pair read is cached and only replaced when a value actually differs.
 */
const noopSubscribe = () => () => {}
let snapshot = { leatherLot: '', carton: '' }
function readRemembered() {
  const next = { leatherLot: readLast(LAST_LOT), carton: readLast(LAST_CARTON) }
  if (next.leatherLot !== snapshot.leatherLot || next.carton !== snapshot.carton) snapshot = next
  return snapshot
}
const SERVER_SNAPSHOT = { leatherLot: '', carton: '' }
const serverRemembered = () => SERVER_SNAPSHOT
