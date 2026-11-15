'use client'

import type { PieceView } from '@hf/server'
import {
  formatAge,
  formatKolkata,
  formatEventType,
  formatSerial,
  stageColor,
  stageTextColor,
} from '@hf/server/format'
import { stageForState } from '@hf/domain'
import { stateName, eventName } from '@/lib/i18n/dictionary'
import { useT } from '@/lib/i18n/useT'

/**
 * What this piece is, at arm's length.
 *
 * The style code is the largest thing on the screen because it is what the
 * operator is checking against the cut panel in their other hand. The stage
 * pill takes the colour of the physical label stock — blue cutting, red
 * pasting, yellow stitching, green finishing — so screen and sticker can be
 * matched at a glance. Oxblood never appears here; it belongs to the buttons.
 */
export function PieceCard({ view }: { view: PieceView }) {
  const { t, lang } = useT()
  const stage = stageForState(view.state)
  return (
    <section
      className="rounded-xl border p-4"
      style={{ borderColor: 'var(--hf-line)', background: 'var(--hf-card)' }}
    >
      <div className="flex items-start justify-between gap-3">
        <span
          className="hf-ui rounded-md px-3 py-2 text-sm uppercase"
          style={{ background: stageColor(stage), color: stageTextColor(stage) }}
        >
          {stateName(view.state, lang)}
        </span>
        <span className="font-mono text-sm" style={{ color: 'var(--hf-muted)' }}>
          {view.qrToken}
        </span>
      </div>

      <p className="hf-display mt-4 text-4xl leading-tight">{view.styleCode}</p>

      <p className="mt-1 text-xl font-semibold">
        {view.size} · {view.shade} · #{formatSerial(view.serial)}
      </p>

      <p className="mt-1 text-base" style={{ color: 'var(--hf-muted)' }}>
        {view.orderNumber} · {view.programName} · {view.buyerName}
      </p>

      <dl
        className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 border-t pt-3 text-base"
        style={{ borderColor: 'var(--hf-line)' }}
      >
        <dt className="hf-label text-[10px] leading-6" style={{ color: 'var(--hf-muted)' }}>
          {t('with')}
        </dt>
        <dd className="font-semibold">{view.worker?.name ?? t('store_room')}</dd>

        <dt className="hf-label text-[10px] leading-6" style={{ color: 'var(--hf-muted)' }}>
          {t('since')}
        </dt>
        <dd>{formatAge(view.ageMinutes)}</dd>

        <dt className="hf-label text-[10px] leading-6" style={{ color: 'var(--hf-muted)' }}>
          {t('last')}
        </dt>
        <dd>
          {view.lastEvent ? (
            <>
              {eventName(view.lastEvent.type, lang, formatEventType(view.lastEvent.type))}
              <span className="block text-sm" style={{ color: 'var(--hf-muted)' }}>
                {view.lastEvent.by} · {formatKolkata(view.lastEvent.at)}
              </span>
            </>
          ) : (
            t('created')
          )}
        </dd>
      </dl>
    </section>
  )
}
