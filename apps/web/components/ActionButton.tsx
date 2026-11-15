'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { Action } from '@hf/domain'
import { mutate, MutateError } from '@/lib/client-mutate'
import { actionLabel, type Key } from '@/lib/i18n/dictionary'
import { useT } from '@/lib/i18n/useT'
import { PhotoCapture } from '@/components/PhotoCapture'
import { TextField } from '@/components/TextField'

/** Hold and release are evidence, not just a reason: both need a reason and a photo before the button arms. */
const NEEDS_PHOTO: Action[] = ['hold', 'release']

/**
 * Actions that open their own screen because they need workers, photos or
 * checks. Everything checklist-gated goes through the one stepper route, so a
 * scanned planned label activates from the same screen a QA runs on.
 */
const SUBSCREEN: Partial<Record<Action, string>> = {
  activate: 'do/activate',
  submit_qa: 'do/submit_qa',
  issue: 'do/issue',
  receive: 'do/receive',
  pack: 'do/pack',
  reject: 'reject',
}

/**
 * Actions with no route handler behind them.
 *
 * `cancel` has no endpoint in this build — the domain lists it as a legal
 * transition, but the office cancels through a quantity change on the order,
 * so the button says so rather than failing on tap.
 */
const NOT_IN_BUILD: Action[] = ['cancel']

const REPRINT_REASONS = [
  ['damaged', 'reprint_damaged'],
  ['unreadable', 'reprint_unreadable'],
  ['missing', 'reprint_missing'],
  ['correction', 'reprint_correction'],
] as const satisfies readonly (readonly [string, Key])[]

/** One `confirm_<action>` key per reason-only action (the actions that open the inline reason panel). */
const CONFIRM_KEY: Partial<Record<Action, Key>> = {
  hold: 'confirm_hold',
  release: 'confirm_release',
  reject: 'confirm_reject',
  reprint: 'confirm_reprint',
}

function buttonStyle(primary: boolean): React.CSSProperties {
  return primary
    ? { background: 'var(--hf-oxblood-lit)', color: 'var(--hf-paper)', borderColor: 'var(--hf-oxblood-lit)' }
    : { background: 'var(--hf-card)', color: 'var(--hf-ink)', borderColor: 'var(--hf-line)' }
}

const CLS = 'hf-ui flex min-h-14 w-full items-center justify-center rounded-lg border-2 px-4 text-base uppercase'

/**
 * One action, one button, sized for a gloved thumb.
 *
 * The first allowed action is the primary one and wears oxblood; everything
 * else is quiet. Reason-only actions open inline rather than navigating,
 * because typing "wrong shade" should not cost a page load at the bench.
 */
export function ActionButton({
  action,
  pieceId,
  version,
  primary,
}: {
  action: Action
  pieceId: string
  version: number
  primary: boolean
}) {
  const router = useRouter()
  const { t, lang } = useT()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [photos, setPhotos] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [conflict, setConflict] = useState(false)
  const needsPhoto = NEEDS_PHOTO.includes(action)

  const label = actionLabel(action, lang)

  const sub = SUBSCREEN[action]
  if (sub) {
    // The primary action on the piece detail always opens the guided
    // stepper, and the stepper's own Next-step fact above already names
    // the action — the button itself just says Next, at the 64px primary
    // size. Secondary actions (under More) keep their action label.
    return (
      <Link
        href={`/pieces/${pieceId}/${sub}`}
        className={primary ? `${CLS} min-h-16 text-xl` : CLS}
        style={buttonStyle(primary)}
      >
        {primary ? t('next_btn') : label}
      </Link>
    )
  }

  if (NOT_IN_BUILD.includes(action)) {
    return (
      <button
        type="button"
        disabled
        className={`${CLS} opacity-50`}
        style={buttonStyle(false)}
      >
        {label} · not in this build
      </button>
    )
  }

  const submit = async () => {
    setMsg(null)
    setConflict(false)
    setBusy(true)
    try {
      await mutate(`/api/pieces/${pieceId}/${action}`, { reason, expectedVersion: version, attachmentIds: photos })
      setOpen(false)
      setReason('')
      setPhotos([])
      router.refresh()
    } catch (e) {
      if (e instanceof MutateError && e.status === 409) {
        setConflict(true)
        setMsg(t('changed_rescan'))
      } else {
        setMsg(e instanceof Error ? e.message : t('action_failed'))
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={CLS}
        style={buttonStyle(primary)}
      >
        {label}
      </button>

      {open && (
        <div
          className="grid gap-3 rounded-lg border p-3"
          style={{ borderColor: 'var(--hf-line)', background: 'var(--hf-card)' }}
        >
          {action === 'reprint' ? (
            <>
              <label className="hf-label text-[10px]" style={{ color: 'var(--hf-muted)' }}>
                {t('why_reprint')}
              </label>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="min-h-14 rounded-lg border-2 px-3 text-lg"
                style={{ borderColor: 'var(--hf-line)', background: 'var(--hf-paper)', color: 'var(--hf-ink)' }}
              >
                <option value="">Choose a reason</option>
                {REPRINT_REASONS.map(([v, k]) => (
                  <option key={v} value={v}>
                    {t(k)}
                  </option>
                ))}
              </select>
            </>
          ) : (
            <TextField label={t('reason')} value={reason} onChange={setReason} maxLength={200} placeholder={t('say_what_happened')} />
          )}

          {needsPhoto && <PhotoCapture value={photos} onChange={setPhotos} required />}

          <button
            type="button"
            onClick={submit}
            disabled={!reason || busy || (needsPhoto && photos.length === 0)}
            className={`${CLS} disabled:opacity-50`}
            style={buttonStyle(true)}
          >
            {busy ? t('saving') : t(CONFIRM_KEY[action] ?? 'confirm')}
          </button>

          {needsPhoto && !reason && photos.length === 0 && (
            <p className="text-sm" style={{ color: 'var(--hf-muted)' }}>
              {t('reason_photo_required')}
            </p>
          )}

          {msg && (
            <p role="alert" className="text-base font-semibold" style={{ color: 'var(--hf-oxblood-deep)' }}>
              {msg}{' '}
              {conflict && (
                <Link href="/scan" className="underline">
                  {t('nav_scan')}
                </Link>
              )}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
