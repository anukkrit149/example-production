import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getChecklist, getProgram } from '@hf/server'
import { ChecklistEditor } from '@/components/checklists/ChecklistEditor'
import { PageHeader } from '@/components/ui'
import { pageUser } from '@/lib/page-user'
import { isAdmin } from '@/lib/roles'

export const dynamic = 'force-dynamic'

export default async function ChecklistPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await pageUser()
  if (!isAdmin(user)) notFound()
  const { id } = await params
  const detail = await getChecklist(id).catch(() => null)
  if (!detail) notFound()
  const program = detail.programId ? await getProgram(detail.programId) : null
  const crumbs = program
    ? [{ href: `/programs/${program.id}/checklists?category=${detail.category}`, label: program.name }, { label: detail.category }]
    : [{ href: `/checklists?category=${detail.category}`, label: 'Checklists' }, { label: detail.category }]

  return (
    <>
      <PageHeader
        eyebrow={<nav aria-label="Breadcrumb" className="flex gap-2">{crumbs.map((c, i) => c.href ? <Link key={i} href={c.href} className="hover:underline">{c.label}</Link> : <span key={i}>{c.label}</span>)}</nav>}
        title={`${detail.stage ? `${detail.stage} · ` : ''}${detail.step}`}
      />
      <ChecklistEditor detail={detail} />
    </>
  )
}
