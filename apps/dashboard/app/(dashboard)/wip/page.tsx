import { awaitingQa, onHold, withWorkers } from '@hf/server'
import { formatAge, formatKolkata, stageColor, stageTextColor } from '@hf/server/format'
import { PieceTable } from '@/components/PieceTable'
import { Empty, PageHeader } from '@/components/ui'
import { pageUser } from '@/lib/page-user'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'WIP · Sample Factory Dashboard' }

const Stage = ({ stage }: { stage: string }) => (
  <span className="hf-ui rounded px-2 py-0.5 text-[11px] uppercase" style={{ background: stageColor(stage), color: stageTextColor(stage) }}>{stage}</span>
)

/** Three questions a supervisor asks: who has what, what is waiting for QA, what is stuck. */
export default async function WipPage() {
  await pageUser()
  const [workers, qa, held] = await Promise.all([withWorkers(), awaitingQa(), onHold()])
  return (
    <>
      <PageHeader title="Work in progress" />

      <section className="mb-10">
        <h2 className="hf-display mb-3 text-xl">With workers</h2>
        {workers.length === 0 ? <Empty>Nothing is out with a worker.</Empty> : workers.map((w) => (
          <details key={`${w.worker.id}-${w.stage}`} className="mb-2 rounded-lg border" style={{ borderColor: 'var(--hf-line)', background: 'var(--hf-card)' }}>
            <summary className="flex cursor-pointer items-center gap-4 px-4 py-3">
              <span className="font-semibold">{w.worker.name}</span>
              <span className="text-sm" style={{ color: 'var(--hf-muted)' }}>{w.worker.type}</span>
              <Stage stage={w.stage} />
              <span className="hf-num ml-auto text-sm">{w.count} pieces · oldest {formatAge(w.oldestMinutes)}</span>
            </summary>
            <div className="border-t p-2" style={{ borderColor: 'var(--hf-line)' }}><PieceTable pieces={w.pieces} /></div>
          </details>
        ))}
      </section>

      <section className="mb-10">
        <h2 className="hf-display mb-3 text-xl">Awaiting QA in the store room</h2>
        {qa.length === 0 ? <Empty>Nothing is waiting for QA.</Empty> : qa.map((q) => (
          <details key={q.stage} className="mb-2 rounded-lg border" style={{ borderColor: 'var(--hf-line)', background: 'var(--hf-card)' }}>
            <summary className="flex cursor-pointer items-center gap-4 px-4 py-3"><Stage stage={q.stage} /><span className="hf-num ml-auto text-sm">{q.count} pieces · oldest {formatAge(q.oldestMinutes)}</span></summary>
            <div className="border-t p-2" style={{ borderColor: 'var(--hf-line)' }}><PieceTable pieces={q.pieces} /></div>
          </details>
        ))}
      </section>

      <section>
        <h2 className="hf-display mb-3 text-xl">On hold</h2>
        {held.length === 0 ? <Empty>Nothing is on hold.</Empty> : (
          <table className="hf-table hf-cards w-full">
            <thead><tr><th>Piece</th><th>Order</th><th>Style</th><th>Reason</th><th>Held by</th><th>Since</th></tr></thead>
            <tbody>
              {held.map((h) => (
                <tr key={h.piece.id}>
                  <td data-primary><a href={`/pieces/${h.piece.id}`} className="font-mono text-xs hover:underline">{h.piece.qrToken}</a></td>
                  <td data-label="Order">{h.piece.orderNumber}</td><td data-label="Style">{h.piece.styleCode} {h.piece.size} {h.piece.shade}</td>
                  <td data-label="Reason">{h.reason ?? '—'}</td><td data-label="Held by">{h.heldBy ?? '—'}</td><td data-label="Since">{h.heldAt ? formatKolkata(h.heldAt) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  )
}
