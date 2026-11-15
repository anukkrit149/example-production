'use client'

import Link from 'next/link'
import {
  detailEntries,
  formatDetailKey,
  formatDetailValue,
  formatEventType,
  formatKolkata,
  stageColor,
  stageTextColor,
} from '@hf/server/format'
import type { PieceHistory } from '@hf/server'
import { eventName } from '@/lib/i18n/dictionary'
import { useT } from '@/lib/i18n/useT'
import { ChecklistAnswers, type ChecklistRecordShape } from '@/components/ChecklistAnswers'

/** `details.checklist` is only ever the shape `assertChecklistPassed` wrote; this just guards the JSON blob before it is trusted as that shape. */
const checklistOf = (details: unknown): ChecklistRecordShape | null => {
  const c = (details as { checklist?: unknown } | null)?.checklist
  return c && typeof c === 'object' && Array.isArray((c as { answers?: unknown }).answers) ? (c as ChecklistRecordShape) : null
}

/**
 * The text-bearing half of the history page: headings, event names, and the
 * back link. Split out from the server-rendered page so it can call `useT`.
 */
export function HistoryList({ history }: { history: PieceHistory }) {
  const { t, lang } = useT()

  return (
    <>
      <div>
        <h1 className="hf-display text-2xl">{t('history')}</h1>
        <p className="font-mono text-base" style={{ color: 'var(--hf-muted)' }}>
          {history.piece.qrToken}
        </p>
      </div>

      {history.events.length === 0 && (
        <p className="text-lg" style={{ color: 'var(--hf-muted)' }}>
          Nothing has happened to this piece yet.
        </p>
      )}

      <ol className="grid gap-3">
        {history.events.map((e) => {
          const details = detailEntries(e.details)
          const checklist = checklistOf(e.details)
          const name = eventName(e.eventType, lang, formatEventType(e.eventType))
          return (
            <li
              key={e.id}
              className="rounded-xl border p-3"
              style={{ borderColor: 'var(--hf-line)', background: 'var(--hf-card)' }}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-lg font-semibold">{name}</p>
                {e.stage && (
                  <span
                    className="hf-ui shrink-0 rounded px-2 py-1 text-xs uppercase"
                    style={{ background: stageColor(e.stage), color: stageTextColor(e.stage) }}
                  >
                    {e.stage}
                  </span>
                )}
              </div>

              <p className="mt-1 text-base" style={{ color: 'var(--hf-muted)' }}>
                {formatKolkata(e.createdAt)} · {e.by}
                {e.worker ? ` · ${e.worker}` : ''}
              </p>

              {/*
                Key above value, not beside it. A tracked-out label like
                "Photo override reason" is wider than half a 390 px screen, so
                a two-column row puts the label on top of its own value.
              */}
              {details.length > 0 && (
                <dl className="mt-2 grid gap-2 text-base">
                  {details.map(([k, v]) => (
                    <div key={k}>
                      <dt className="hf-label text-[10px]" style={{ color: 'var(--hf-muted)' }}>
                        {formatDetailKey(k)}
                      </dt>
                      <dd className="break-words">{formatDetailValue(v)}</dd>
                    </div>
                  ))}
                </dl>
              )}

              {checklist && <ChecklistAnswers record={checklist} />}

              {e.photos.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {e.photos.map((p) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={p.id}
                      src={p.url}
                      alt={`Photo taken at ${name}`}
                      className="h-24 w-24 rounded-lg border object-cover"
                      style={{ borderColor: 'var(--hf-line)' }}
                    />
                  ))}
                </div>
              )}
            </li>
          )
        })}
      </ol>

      <Link
        href={`/pieces/${history.piece.id}`}
        className="hf-ui flex min-h-14 items-center justify-center rounded-lg border-2 px-4 text-base uppercase"
        style={{ borderColor: 'var(--hf-line)', background: 'var(--hf-card)' }}
      >
        {t('go_back')}
      </Link>
    </>
  )
}
