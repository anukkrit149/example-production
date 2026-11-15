'use client'

import Link from 'next/link'
import type { PieceState } from '@hf/domain'
import { stateName } from '@/lib/i18n/dictionary'
import { useT } from '@/lib/i18n/useT'
import type { SignedBy } from './ChecklistStepper'

/**
 * The end of the step, at arm's length.
 *
 * Green fills the screen because that is what an operator reads across a bench
 * without picking the phone up: the tick and the colour say "done", the words
 * say what it became. Both scripts appear — the current language large, the
 * other under it — so a supervisor glancing over a shoulder reads the same
 * screen as the operator holding it. The signed-in name at the foot is the
 * same one the summary showed above the write button — this is confirmation
 * of who signed off, not a new choice.
 */
export function Done({ newState, pieceId, signedBy }: { newState: string; pieceId: string; signedBy: SignedBy }) {
  const { t, lang } = useT()
  const state = newState as PieceState
  const other = lang === 'hi' ? 'en' : 'hi'

  return (
    <section
      className="grid justify-items-center gap-6 rounded-xl border-2 p-6 text-center"
      style={{ background: 'var(--hf-stage-finishing)', borderColor: 'var(--hf-stage-finishing)', color: '#fff' }}
      role="status"
      aria-live="polite"
    >
      <svg width="120" height="120" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.6" opacity={0.6} />
        <path d="m7 12.4 3.3 3.3L17 8.6" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>

      <div className="grid gap-1">
        <p className="hf-label text-[10px]" style={{ opacity: 0.85 }}>{t('submitted')}</p>
        <p className="hf-display text-3xl leading-tight">{stateName(state, lang)}</p>
        <p className="text-lg" style={{ opacity: 0.8 }}>{stateName(state, other)}</p>
        <p className="mt-2 text-base" style={{ opacity: 0.85 }}>{t('signed_off_by')} {signedBy.name}</p>
      </div>

      <Link
        href="/scan"
        className="hf-ui flex min-h-16 w-full items-center justify-center rounded-xl border-2 px-4 text-xl uppercase"
        style={{ background: '#fff', borderColor: '#fff', color: 'var(--hf-ink)' }}
      >
        {t('scan_next')}
      </Link>

      <Link
        href="/home"
        className="hf-ui flex min-h-14 w-full items-center justify-center rounded-xl border-2 px-4 text-lg uppercase"
        style={{ background: 'transparent', borderColor: '#fff', color: '#fff' }}
      >
        {t('nav_home')}
      </Link>

      <Link href={`/pieces/${pieceId}/history`} className="hf-ui text-base underline" style={{ opacity: 0.9 }}>
        {t('history')}
      </Link>
    </section>
  )
}
