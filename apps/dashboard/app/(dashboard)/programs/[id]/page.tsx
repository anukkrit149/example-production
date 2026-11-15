import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getProgram, listOrganizations, programChecklistStatus } from '@hf/server'
import { Drawer } from '@/components/Drawer'
import { OrderForm } from '@/components/forms/OrderForm'
import { ProgramForm } from '@/components/forms/ProgramForm'
import { OrdersTable } from '@/components/OrdersTable'
import { StageStrip } from '@/components/StageStrip'
import { StatusPill } from '@/components/StatusPill'
import { Facts, PageHeader } from '@/components/ui'
import { pageUser } from '@/lib/page-user'
import { canWrite } from '@/lib/roles'

export const dynamic = 'force-dynamic'

export default async function ProgramPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await pageUser()
  const [program, orgs, checklistRows] = await Promise.all([getProgram(id), listOrganizations(), programChecklistStatus(id)])
  if (!program) notFound()
  const write = canWrite(user)
  const agents = orgs.filter((o) => o.active && o.type === 'agent')

  return (
    <>
      <PageHeader eyebrow="Program" title={program.name}>
        {write && (
          <>
            <Drawer title="Edit program" trigger="Edit" variant="ghost">
              <ProgramForm buyers={[program.buyer]} agents={agents} program={{ id: program.id, name: program.name, season: program.season, agentId: program.agent?.id ?? null }} />
            </Drawer>
            <Drawer title="New order" trigger="New order"><OrderForm programId={program.id} /></Drawer>
          </>
        )}
      </PageHeader>

      <Facts items={[
        ['Buyer', program.buyer.name],
        ['Buying house', program.agent?.name ?? 'Direct'],
        ['Season', program.season ?? '—'],
        ['Orders', program.orderCount],
        ['Ordered pieces', program.progress.ordered],
        ['Status', <StatusPill key="s" status={program.progress.status} />],
      ]} />

      <section className="mb-8">
        <h2 className="hf-label mb-2" style={{ color: 'var(--hf-muted)' }}>Progress across the program</h2>
        <StageStrip counts={program.progress.counts} ordered={program.progress.ordered} scope={{ programId: program.id }} />
      </section>

      <h2 className="hf-display mb-3 text-xl">Orders</h2>
      <OrdersTable orders={program.orders} />

      <section className="mt-8 flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3" style={{ borderColor: 'var(--hf-line)', background: 'var(--hf-card)' }}>
        <div className="grid gap-0.5">
          <h2 className="hf-label" style={{ color: 'var(--hf-muted)' }}>Checklists</h2>
          <p className="text-sm">
            {checklistRows.filter((r) => r.customised).length === 0
              ? 'Factory defaults throughout'
              : `${checklistRows.filter((r) => r.customised).length} customised for this program`}
          </p>
        </div>
        <Link href={`/programs/${program.id}/checklists`} className="hf-ui inline-flex h-9 items-center rounded-md border px-4 text-xs uppercase" style={{ borderColor: 'var(--hf-line)' }}>Manage checklists</Link>
      </section>
    </>
  )
}
