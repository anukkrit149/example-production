import Link from 'next/link'
import { listOrganizations, listPrograms } from '@hf/server'
import { Drawer } from '@/components/Drawer'
import { ProgramForm } from '@/components/forms/ProgramForm'
import { StageStrip } from '@/components/StageStrip'
import { StatusPill } from '@/components/StatusPill'
import { Empty, PageHeader } from '@/components/ui'
import { pageUser } from '@/lib/page-user'
import { canWrite } from '@/lib/roles'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Programs · Sample Factory Dashboard' }

export default async function ProgramsPage() {
  const user = await pageUser()
  const [programs, orgs] = await Promise.all([listPrograms(), listOrganizations()])
  const buyers = orgs.filter((o) => o.active && o.type === 'buyer')
  const agents = orgs.filter((o) => o.active && o.type === 'agent')

  return (
    <>
      <PageHeader title="Programs">
        {canWrite(user) && (
          <Drawer title="New program" trigger="New program">
            {buyers.length === 0 ? <p className="text-sm">Add the buyer first: <Link href="/organizations" className="underline">Buyers → New buyer or buying house</Link>.</p> : <ProgramForm buyers={buyers} agents={agents} />}
          </Drawer>
        )}
      </PageHeader>

      {programs.length === 0 ? (
        <Empty>No programs yet. Create the first one to start an order.</Empty>
      ) : (
        <div className="overflow-x-auto">
          <table className="hf-table hf-cards w-full">
            <thead>
              <tr><th>Program</th><th>Buyer</th><th>Agent</th><th>Season</th><th className="hf-num">Orders</th><th className="hf-num">Ordered</th><th>Progress</th><th>Status</th></tr>
            </thead>
            <tbody>
              {programs.map((p) => (
                <tr key={p.id}>
                  <td data-primary><Link href={`/programs/${p.id}`} className="font-semibold underline-offset-2 hover:underline">{p.name}</Link></td>
                  <td data-label="Buyer">{p.buyer.name}</td>
                  <td data-label="Agent" style={{ color: p.agent ? undefined : 'var(--hf-muted)' }}>{p.agent?.name ?? 'Direct'}</td>
                  <td data-label="Season">{p.season ?? '—'}</td>
                  <td data-label="Orders" className="hf-num">{p.orderCount}</td>
                  <td data-label="Ordered" className="hf-num">{p.progress.ordered}</td>
                  <td className="md:min-w-[260px]"><StageStrip compact counts={p.progress.counts} ordered={p.progress.ordered} scope={{ programId: p.id }} /></td>
                  <td data-label="Status"><StatusPill status={p.progress.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
