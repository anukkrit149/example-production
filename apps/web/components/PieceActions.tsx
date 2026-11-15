'use client'

import Link from 'next/link'
import type { PieceView } from '@hf/server'
import { formatEventType, formatKolkata } from '@hf/server/format'
import { actionLabel, eventName, stateName } from '@/lib/i18n/dictionary'
import { useT } from '@/lib/i18n/useT'
import { ActionButton } from '@/components/ActionButton'

/**
 * The text-bearing half of the piece page: three facts, the one **Next**
 * button, the rest of the actions tucked under a disclosure, and the two
 * footer links. Split out from the server-rendered page so it can call
 * `useT`.
 *
 * Status, next step and last sign-off are the whole decision an operator
 * needs before tapping Next — everything else on this screen (hold, reject,
 * reprint, release) is there for the rarer case, which is why it starts
 * closed.
 */
export function PieceActions({ view }: { view: PieceView }) {
  const { t, lang } = useT()
  const { id: pieceId, version, actions } = view
  const [first, ...rest] = actions

  return (
    <>
      <dl className="grid gap-3 text-lg">
        <div>
          <dt className="hf-label text-[10px]" style={{ color: 'var(--hf-muted)' }}>{t('detail_status')}</dt>
          <dd className="font-semibold">{stateName(view.state, lang)}</dd>
        </div>
        <div>
          <dt className="hf-label text-[10px]" style={{ color: 'var(--hf-muted)' }}>{t('detail_next_step')}</dt>
          <dd className="font-semibold">{first ? actionLabel(first, lang) : t('no_actions')}</dd>
        </div>
        <div>
          <dt className="hf-label text-[10px]" style={{ color: 'var(--hf-muted)' }}>{t('detail_last_signoff')}</dt>
          <dd>
            {view.lastEvent ? (
              <>
                {eventName(view.lastEvent.type, lang, formatEventType(view.lastEvent.type))} · {view.lastEvent.by} · {formatKolkata(view.lastEvent.at)}
              </>
            ) : '—'}
          </dd>
        </div>
      </dl>

      {first && <ActionButton action={first} pieceId={pieceId} version={version} primary />}

      {rest.length > 0 && (
        <details className="grid gap-2">
          <summary className="hf-ui cursor-pointer text-base uppercase" style={{ color: 'var(--hf-muted)' }}>
            {t('more_actions')}
          </summary>
          <div className="mt-2 grid gap-2">
            {rest.map((a) => (
              <ActionButton key={a} action={a} pieceId={pieceId} version={version} primary={false} />
            ))}
          </div>
        </details>
      )}

      <div
        className="mt-2 flex items-center justify-between border-t pt-4"
        style={{ borderColor: 'var(--hf-line)' }}
      >
        <Link href={`/pieces/${pieceId}/history`} className="hf-ui text-base underline">
          {t('history')}
        </Link>
        <Link href="/scan" className="hf-ui text-base underline">
          {t('scan_another')}
        </Link>
      </div>
    </>
  )
}
