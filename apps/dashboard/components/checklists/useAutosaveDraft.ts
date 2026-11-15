'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { mutate } from '@/lib/client-mutate'
import type { EditorRow } from './ChecklistEditor'

export type SaveState = 'saved' | 'saving' | 'unsaved' | 'invalid' | 'failed'

/** The contract's rules, checked before a request is made: 1–20 items, both texts present, and a measurement needs a unit. */
export const draftIsValid = (rows: EditorRow[]) =>
  rows.length >= 1 && rows.length <= 20 &&
  rows.every((r) => r.textEn.trim() !== '' && r.textHi.trim() !== '' && (r.kind !== 'measure' || r.unit.trim() !== ''))

/**
 * The wire shape for one item: a non-measurement kind must not carry `unit`,
 * `min` or `max` at all — the contract rejects the keys outright, not just a
 * truthy value — so they are omitted rather than sent as `undefined`/`null`.
 */
const toWireItem = (r: EditorRow) => {
  const { kind, textEn, textHi, pictogram } = r
  if (kind !== 'measure') return { kind, textEn, textHi, pictogram }
  return {
    kind, textEn, textHi, pictogram,
    unit: r.unit.trim(),
    min: r.min === '' ? null : Number(r.min),
    max: r.max === '' ? null : Number(r.max),
  }
}

/**
 * What the last request is doing, and to which rows. The snapshot is what makes
 * 'saving' and 'failed' answerable about *these* rows: a request in flight for
 * older rows says nothing about the ones on screen now, which are simply
 * unsaved.
 */
type Phase = { kind: 'idle' } | { kind: 'saving'; snapshot: string } | { kind: 'failed'; snapshot: string }

/**
 * PUTs the draft 800 ms after the last change. The initial rows are what the
 * server already has, so returning to them counts as saved (and React's
 * double-run of effects in development does not fire a save). `savedOnce`
 * tells the caller a draft now exists on the server.
 *
 * The visible state is derived during render, not set from an effect: whether
 * the rows differ from the last thing the server accepted (`baseline`), whether
 * they are valid, and whether the outstanding request is even about them are
 * all facts about this render's rows.
 *
 * Saves are serialized. `mutate` retries a network error up to three times, so
 * one save can outlive the 800 ms debounce; without a guard two PUTs race, and
 * an older one resolving last would roll `baseline` backwards and strand the
 * chip on Unsaved with no dependency left to change. So a save in flight blocks
 * the next one, and finishing a save bumps `settled`, which re-arms the debounce
 * for whatever the rows have become.
 */
export function useAutosaveDraft(id: string, rows: EditorRow[], hadDraft: boolean) {
  const [baseline, setBaseline] = useState(() => JSON.stringify(rows))
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
  const [savedOnce, setSavedOnce] = useState(hadDraft)
  /** Bumped whenever a request settles, purely to re-run the debounce effect. */
  const [settled, setSettled] = useState(0)

  const latest = useRef(rows)
  const inFlight = useRef(false)

  const serialised = JSON.stringify(rows)
  const dirty = serialised !== baseline
  const valid = draftIsValid(rows)
  // Order matters. Clean rows are 'saved' whatever happened before. An unsavable
  // draft is 'invalid' — Retry has nothing to send until both texts are filled
  // in. 'saving' and 'failed' only speak for the rows they actually name, so an
  // edit made during a save, or after a failed one, is plain 'unsaved'.
  const state: SaveState =
    !dirty ? 'saved'
      : !valid ? 'invalid'
        : phase.kind === 'saving' && phase.snapshot === serialised ? 'saving'
          : phase.kind === 'failed' && phase.snapshot === serialised ? 'failed'
            : 'unsaved'

  const save = useCallback(async () => {
    const snapshot = latest.current
    const body = JSON.stringify(snapshot)
    if (!draftIsValid(snapshot)) return
    // A request is already out. Dropping this one is safe: the in-flight save
    // bumps `settled` when it lands, which re-arms the debounce for whatever
    // the rows are then. No PUT ever carries stale rows past a newer snapshot.
    if (inFlight.current) return

    inFlight.current = true
    setPhase({ kind: 'saving', snapshot: body })
    try {
      await mutate(`/api/checklists/${id}/draft`, { items: snapshot.map(toWireItem) }, { method: 'PUT' })
      setSavedOnce(true)
      // Adopt this snapshot as the baseline only if it is still what is on
      // screen. If the rows moved on, the baseline stays put so the newer rows
      // keep reading as dirty and get their own save.
      if (JSON.stringify(latest.current) === body) setBaseline(body)
      setPhase({ kind: 'idle' })
    } catch {
      setPhase({ kind: 'failed', snapshot: body })
    } finally {
      inFlight.current = false
      // Re-arm the debounce for whatever the rows have become — an edit that
      // arrived mid-flight was dropped by the in-flight guard and has no
      // dependency change left to wake it. The effect declines to re-arm for
      // rows that just failed, so this cannot become a retry loop.
      setSettled((n) => n + 1)
    }
  }, [id])

  // Debounce. A failure on these exact rows is left for the Retry button rather
  // than re-sent on a loop; any edit changes the rows, so the guard lifts by
  // itself and the new rows get their timer.
  const failedHere = phase.kind === 'failed' && phase.snapshot === serialised
  useEffect(() => {
    latest.current = rows
    if (!dirty || !valid || failedHere) return
    const timer = setTimeout(save, 800)
    return () => clearTimeout(timer)
  }, [rows, dirty, valid, failedHere, save, settled])

  // Anything but 'saved' means the server does not have this work yet —
  // an unsavable draft included, since that is the edit most easily lost.
  useEffect(() => {
    if (state === 'saved') return
    const onLeave = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', onLeave)
    return () => window.removeEventListener('beforeunload', onLeave)
  }, [state])

  return { state, savedOnce, retry: save }
}
