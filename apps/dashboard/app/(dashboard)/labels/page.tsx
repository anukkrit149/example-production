import { listBatches, listReprints } from '@hf/server'
import { formatKolkata, formatSerial } from '@hf/server/format'
import { Empty, PageHeader } from '@/components/ui'
import { pageUser } from '@/lib/page-user'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Labels · Sample Factory Dashboard' }

const stageOf = (kind: string, stage: string | null) => (kind === 'planned' ? 'Planned' : stage)

export default async function LabelsPage() {
  await pageUser()
  const [batches, reprints] = await Promise.all([listBatches(), listReprints()])

  return (
    <>
      <PageHeader title="Labels" />

      <section className="mb-10">
        <h2 className="hf-display mb-3 text-xl">Export batches</h2>
        {batches.length === 0 ? (
          <Empty>No labels exported yet.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="hf-table hf-cards w-full">
              <thead>
                <tr>
                  <th>Kind</th><th>Stage</th><th className="hf-num">Count</th><th>Format</th><th>By</th>
                  <th>Created</th><th>Printed</th><th className="hf-num">Copies</th><th />
                </tr>
              </thead>
              <tbody>
                {batches.map((b) => (
                  <tr key={b.id}>
                    <td data-primary>{b.kind === 'planned' ? 'Planned' : 'Stage'}</td>
                    <td data-label="Stage">{stageOf(b.kind, b.stage)}</td>
                    <td data-label="Count" className="hf-num">{b.labelCount}</td>
                    <td data-label="Format" className="uppercase">{b.format}</td>
                    <td data-label="By">{b.createdBy}</td>
                    <td data-label="Created">{formatKolkata(b.createdAt)}</td>
                    <td data-label="Printed">{b.printedAt ? formatKolkata(b.printedAt) : '—'}</td>
                    <td data-label="Copies" className="hf-num">{b.copies ?? '—'}</td>
                    <td className="text-right"><a href={`/api/labels/${b.id}/file`} className="hf-ui text-xs uppercase hover:underline">Download</a></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="hf-display mb-3 text-xl">Reprints</h2>
        {reprints.length === 0 ? (
          <Empty>No reprints requested.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="hf-table hf-cards w-full">
              <thead>
                <tr>
                  <th>Style</th><th>Serial</th><th>Kind / Stage</th><th>Reason</th><th>By</th><th>Requested</th><th>Printed</th>
                </tr>
              </thead>
              <tbody>
                {reprints.map((r) => (
                  <tr key={r.id}>
                    <td data-primary>{r.styleCode}</td>
                    <td data-label="Serial"><a href={`/pieces/${r.pieceId}`} className="font-mono text-xs hover:underline">{formatSerial(r.serial)}</a></td>
                    <td data-label="Kind / Stage">{stageOf(r.kind, r.stage)}</td>
                    <td data-label="Reason">{r.reason}</td>
                    <td data-label="By">{r.requestedBy}</td>
                    <td data-label="Requested">{formatKolkata(r.requestedAt)}</td>
                    <td data-label="Printed">{r.printedAt ? formatKolkata(r.printedAt) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}
