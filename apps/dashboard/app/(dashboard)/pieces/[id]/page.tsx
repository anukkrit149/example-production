import Link from 'next/link'
import { notFound } from 'next/navigation'
import { stageForState } from '@hf/domain'
import { loadPieceHistory, loadPieceView } from '@hf/server'
import { detailEntries, formatAge, formatDetailKey, formatDetailValue, formatEventType, formatKolkata, formatSerial, formatState, stageColor, stageTextColor } from '@hf/server/format'
import { Facts, PageHeader } from '@/components/ui'
import { ChecklistAnswers, GATED_EVENT_TYPES, type ChecklistRecordShape } from '@/components/ChecklistAnswers'
import { EventPhoto } from '@/components/EventPhoto'
import { pageUser } from '@/lib/page-user'

export const dynamic = 'force-dynamic'

/** `details.checklist` is only ever the shape `assertChecklistPassed` wrote; this just guards the JSON blob before it is trusted as that shape. */
const checklistOf = (details: unknown): ChecklistRecordShape | null => {
  const c = (details as { checklist?: unknown } | null)?.checklist
  return c && typeof c === 'object' && Array.isArray((c as { answers?: unknown }).answers) ? (c as ChecklistRecordShape) : null
}

export default async function PiecePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await pageUser()
  const [view, history] = await Promise.all([loadPieceView({ id }), loadPieceHistory(id, 'asc')])
  if (!view || !history) notFound()
  const stage = stageForState(view.state)
  return (
    <>
      <PageHeader eyebrow={<><Link href={`/programs/${view.programId}`} className="hover:underline">{view.programName}</Link> · <Link href={`/orders/${view.orderId}`} className="hover:underline">{view.orderNumber}</Link> · <Link href={`/line-items/${view.lineItemId}`} className="hover:underline">{view.styleCode} {view.size} {view.shade}</Link></>} title={`#${formatSerial(view.serial)}`}>
        <span className="hf-ui rounded px-3 py-1 text-xs uppercase" style={{ background: stageColor(stage), color: stageTextColor(stage) }}>{formatState(view.state)}</span>
      </PageHeader>
      <Facts items={[
        ['Token', <span key="t" className="font-mono">{view.qrToken}</span>], ['Buyer', view.buyerName], ['With', view.worker?.name ?? 'Store room'],
        ['Since', formatAge(view.ageMinutes)], ['Version', view.version], ['Label', view.labelStage ?? '—'],
      ]} />
      <h2 className="hf-display mb-3 text-xl">History</h2>
      {history.events.length === 0 && <p className="text-sm" style={{ color: 'var(--hf-muted)' }}>Nothing has happened to this piece yet. It is waiting to be cut.</p>}
      <ol className="grid gap-3">
        {history.events.map((e) => {
          const details = detailEntries(e.details)
          const checklist = checklistOf(e.details)
          return (
            <li key={e.id} className="grid grid-cols-1 gap-2 rounded-lg border p-4 md:grid-cols-[180px_1fr] md:gap-4" style={{ borderColor: 'var(--hf-line)', background: 'var(--hf-card)' }}>
              <div className="text-sm" style={{ color: 'var(--hf-muted)' }}>{formatKolkata(e.createdAt)}<br /><span style={{ color: 'var(--hf-ink)' }}>{e.by}</span>{e.worker ? ` · ${e.worker}` : ''}</div>
              <div>
                <div className="flex items-center gap-3">
                  <span className="font-semibold">{formatEventType(e.eventType)}</span>
                  {e.stage && <span className="hf-ui rounded px-2 py-0.5 text-[11px] uppercase" style={{ background: stageColor(e.stage), color: stageTextColor(e.stage) }}>{e.stage}</span>}
                </div>
                {details.length > 0 && (
                  <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                    {details.map(([k, v]) => <div key={k} className="contents"><dt style={{ color: 'var(--hf-muted)' }}>{formatDetailKey(k)}</dt><dd className="break-words">{formatDetailValue(v)}</dd></div>)}
                  </dl>
                )}
                {checklist
                  ? <ChecklistAnswers record={checklist} by={e.by} eventType={e.eventType} stage={e.stage} />
                  : GATED_EVENT_TYPES.has(e.eventType) && <p className="mt-2 text-sm" style={{ color: 'var(--hf-muted)' }}>No checklist recorded</p>}
                {e.photos.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {e.photos.map((p) => <EventPhoto key={p.id} url={p.url} alt={`Photo at ${formatEventType(e.eventType)}`} />)}
                  </div>
                )}
              </div>
            </li>
          )
        })}
      </ol>
    </>
  )
}
