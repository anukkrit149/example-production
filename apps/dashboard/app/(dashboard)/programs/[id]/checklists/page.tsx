import Link from 'next/link'
import { notFound } from 'next/navigation'
import { CHECKLIST_CATEGORIES, layoutChecklists, type ChecklistCategory } from '@hf/domain'
import { getProgram, programCategories, programChecklistStatus } from '@hf/server'
import { CategoryTabs } from '@/components/checklists/CategoryTabs'
import { ProgramTimeline } from '@/components/checklists/ProgramTimeline'
import { PageHeader } from '@/components/ui'
import { pageUser } from '@/lib/page-user'
import { isAdmin } from '@/lib/roles'

export const dynamic = 'force-dynamic'

const isCategory = (c: string | undefined): c is ChecklistCategory => (CHECKLIST_CATEGORIES as readonly string[]).includes(c ?? '')

export default async function ProgramChecklistsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ category?: string }> }) {
  const user = await pageUser()
  const { id } = await params
  const [program, rows, used, { category: raw }] = await Promise.all([getProgram(id), programChecklistStatus(id), programCategories(id), searchParams])
  if (!program) notFound()
  const order: ChecklistCategory[] = [...used, ...CHECKLIST_CATEGORIES.filter((c) => !used.includes(c))]
  const category: ChecklistCategory = isCategory(raw) ? raw : order[0]!
  const tags = Object.fromEntries(CHECKLIST_CATEGORIES.filter((c) => !used.includes(c)).map((c) => [c, 'not in this program'])) as Partial<Record<ChecklistCategory, string>>
  const customised = rows.filter((r) => r.customised).length

  return (
    <>
      <PageHeader eyebrow={<Link href={`/programs/${id}`} className="hover:underline">← {program.name}</Link>} title="Checklists">
        <span className="text-sm" style={{ color: 'var(--hf-muted)' }}>{customised === 0 ? 'Factory defaults throughout' : `${customised} customised`}</span>
      </PageHeader>
      <CategoryTabs current={category} order={order} tags={tags} hrefFor={(c) => `/programs/${id}/checklists?category=${c}`} />
      <ProgramTimeline programId={id} rows={layoutChecklists(rows, category)} canEdit={isAdmin(user)} />
    </>
  )
}
