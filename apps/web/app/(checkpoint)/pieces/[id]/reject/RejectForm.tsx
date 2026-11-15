'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { PieceView } from '@hf/server'
import { mutate, MutateError } from '@/lib/client-mutate'
import { PhotoCapture } from '@/components/PhotoCapture'
import { TextField } from '@/components/TextField'
import { useT } from '@/lib/i18n/useT'

/**
 * The same fixed vocabulary the contract enforces. Plain words, because the
 * person tapping this is looking at the piece, not at a code list.
 */
const REASONS = [
  ['cut_defect', 'Cut defect'],
  ['leather_flaw', 'Leather flaw'],
  ['stitch_defect', 'Stitch defect'],
  ['damaged', 'Damaged'],
  ['lost', 'Lost'],
  ['other', 'Other'],
] as const

type Reason = (typeof REASONS)[number][0]

type RejectResponse = {
  replacement: { id: string; qrToken: string; serial: number } | null
}

/**
 * Writing a piece off.
 *
 * This is the one screen in the app that destroys value, and it is styled to
 * say so: the confirm button is a red outline rather than the oxblood primary
 * every other screen uses for "do the normal thing". An operator who taps
 * through this by muscle memory is the failure this colour exists to prevent.
 *
 * The replacement checkbox is the actor's call at this moment, because they
 * are the one who knows whether the leather lot can still yield another piece.
 * Left unticked the line item is simply short, and the progress counts show it.
 */
export function RejectForm({ view }: { view: PieceView }) {
  const router = useRouter()
  const { t } = useT()
  const [reason, setReason] = useState<Reason | null>(null)
  const [note, setNote] = useState('')
  const [photos, setPhotos] = useState<string[]>([])
  const [replace, setReplace] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [conflict, setConflict] = useState(false)
  const [done, setDone] = useState<RejectResponse['replacement']>(null)

  const needsNote = reason === 'other'
  const noteOk = !needsNote || note.trim().length > 0
  const canSubmit = reason !== null && noteOk && !busy

  const submit = async () => {
    if (!canSubmit) return
    setBusy(true)
    setError(null)
    setConflict(false)
    try {
      const res = await mutate<RejectResponse>(`/api/pieces/${view.id}/reject`, {
        reason,
        note: note.trim() || undefined,
        replace,
        attachmentIds: photos,
        expectedVersion: view.version,
      })
      // A new token is the one thing the operator has to carry away from this
      // screen — it goes on the replacement's label — so it gets a beat of its
      // own rather than vanishing behind an immediate redirect.
      if (res.replacement) {
        setDone(res.replacement)
        setBusy(false)
        return
      }
      router.push(`/pieces/${view.id}`)
    } catch (e) {
      if (e instanceof MutateError && e.status === 409) {
        setConflict(true)
        setError('This piece changed. Rescan it.')
      } else {
        setError(
          e instanceof MutateError
            ? e.message
            : 'That did not go through. Check the network and try again.',
        )
      }
      setBusy(false)
    }
  }

  if (done) {
    return (
      <div className="grid gap-5">
        <h2 className="hf-display text-2xl">{t('reject_form_done_title')}</h2>
        <section
          className="grid gap-2 rounded-xl border-2 p-4"
          style={{ borderColor: 'var(--hf-stage-finishing)', background: 'var(--hf-card)' }}
        >
          <h3 className="hf-label text-[10px]" style={{ color: 'var(--hf-muted)' }}>
            {t('reject_form_replacement_title')}
          </h3>
          <p className="font-mono text-2xl font-semibold">{done.qrToken}</p>
          <p className="text-base" style={{ color: 'var(--hf-muted)' }}>
            Piece #{done.serial}, planned. Cut it and print its label from the print queue.
          </p>
        </section>
        <Link
          href={`/pieces/${view.id}`}
          className="hf-ui flex min-h-14 w-full items-center justify-center rounded-lg border-2 px-4 text-base uppercase"
          style={{
            background: 'var(--hf-oxblood-lit)',
            borderColor: 'var(--hf-oxblood-lit)',
            color: 'var(--hf-paper)',
          }}
        >
          Done
        </Link>
      </div>
    )
  }

  return (
    <div className="grid gap-5">
      <h2 className="hf-display text-2xl">{t('reject_form_title')}</h2>

      <p className="text-base" style={{ color: 'var(--hf-muted)' }}>
        This writes the piece off for good. It cannot be undone.
      </p>

      <section className="grid gap-2">
        <h3 className="hf-label text-[10px]" style={{ color: 'var(--hf-muted)' }}>
          Why is it being rejected?
        </h3>
        <div className="grid gap-2">
          {REASONS.map(([value, label]) => {
            const on = reason === value
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setReason(value)}
                className="flex min-h-14 w-full items-center gap-3 rounded-lg border-2 px-4 py-3 text-left"
                style={{
                  borderColor: on ? 'var(--hf-stage-pasting)' : 'var(--hf-line)',
                  background: 'var(--hf-card)',
                }}
              >
                <Dot on={on} />
                <span className="hf-ui text-base uppercase">{label}</span>
              </button>
            )
          })}
        </div>
      </section>

      <section className="grid gap-2">
        <TextField
          id="reject-note"
          label={needsNote ? 'Note (required)' : 'Note (optional)'}
          value={note}
          onChange={setNote}
          maxLength={500}
          placeholder={needsNote ? 'Say what happened' : 'Anything the office should know'}
          style={{
            borderColor: needsNote && !noteOk ? 'var(--hf-stage-pasting)' : 'var(--hf-line)',
          }}
        />
      </section>

      <PhotoCapture value={photos} onChange={setPhotos} />

      <section className="grid gap-2">
        <button
          type="button"
          role="switch"
          aria-checked={replace}
          onClick={() => setReplace((r) => !r)}
          className="flex min-h-16 w-full items-center gap-3 rounded-lg border-2 px-4 py-3 text-left"
          style={{
            borderColor: replace ? 'var(--hf-stage-finishing)' : 'var(--hf-line)',
            background: 'var(--hf-card)',
          }}
        >
          <Box on={replace} />
          <span className="grid">
            <span className="hf-ui text-base uppercase">Cut a replacement</span>
            <span className="text-base" style={{ color: 'var(--hf-muted)' }}>
              Optional. Tick only if the lot still has leather for it.
            </span>
          </span>
        </button>
      </section>

      {/*
        Destructive, and it has to look it. Every other screen spends oxblood on
        "do the normal thing"; this button is a red outline so a thumb travelling
        on habit stops before it lands.
      */}
      <button
        type="button"
        onClick={submit}
        disabled={!canSubmit}
        className="hf-ui flex min-h-14 w-full items-center justify-center rounded-lg border-2 px-4 text-base uppercase disabled:opacity-50"
        style={{
          borderColor: 'var(--hf-stage-pasting)',
          background: 'var(--hf-card)',
          color: 'var(--hf-stage-pasting)',
        }}
      >
        {busy ? 'Rejecting…' : replace ? 'Reject and cut a replacement' : 'Reject this piece'}
      </button>

      {!busy && !reason && (
        <p className="text-base" style={{ color: 'var(--hf-muted)' }}>
          Choose a reason to reject this piece.
        </p>
      )}
      {!busy && needsNote && !noteOk && (
        <p className="text-base" style={{ color: 'var(--hf-muted)' }}>
          A reason of Other needs a note saying what happened.
        </p>
      )}

      {error && (
        <p role="alert" className="text-base font-semibold" style={{ color: 'var(--hf-oxblood-deep)' }}>
          {error}{' '}
          {conflict && (
            <Link href="/scan" className="underline">
              Scan
            </Link>
          )}
        </p>
      )}

      <Link
        href={`/pieces/${view.id}`}
        className="hf-ui text-base underline"
        style={{ color: 'var(--hf-muted)' }}
      >
        Back to the piece
      </Link>
    </div>
  )
}

/** A radio big enough for a gloved thumb, matching the QA screen's tick box. */
function Dot({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden="true"
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2"
      style={{
        borderColor: on ? 'var(--hf-stage-pasting)' : 'var(--hf-line)',
        background: 'var(--hf-paper)',
      }}
    >
      {on && (
        <span
          className="h-4 w-4 rounded-full"
          style={{ background: 'var(--hf-stage-pasting)' }}
        />
      )}
    </span>
  )
}

function Box({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden="true"
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border-2"
      style={{
        borderColor: on ? 'var(--hf-stage-finishing)' : 'var(--hf-line)',
        background: on ? 'var(--hf-stage-finishing)' : 'var(--hf-paper)',
      }}
    >
      {on && (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <path
            d="m5 12.5 4.5 4.5L19 7"
            stroke="var(--hf-paper)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </span>
  )
}
