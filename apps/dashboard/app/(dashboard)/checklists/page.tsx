import { notFound } from 'next/navigation'
import { CHECKLIST_CATEGORIES, layoutChecklists, type ChecklistCategory } from '@hf/domain'
import { listDefaultChecklists } from '@hf/server'
import { CategoryTabs } from '@/components/checklists/CategoryTabs'
import { ChecklistChip, EmptyCell } from '@/components/checklists/ChecklistChip'
import { StageTimeline } from '@/components/checklists/StageTimeline'
import { PageHeader } from '@/components/ui'
import { pageUser } from '@/lib/page-user'
import { isAdmin } from '@/lib/roles'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Checklists · Sample Factory Dashboard' }

const isCategory = (c: string | undefined): c is ChecklistCategory => (CHECKLIST_CATEGORIES as readonly string[]).includes(c ?? '')

export default async function ChecklistsPage({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  const user = await pageUser()
  if (!isAdmin(user)) notFound()
  const { category: raw } = await searchParams
  const category: ChecklistCategory = isCategory(raw) ? raw : 'jacket'
  const checklists = await listDefaultChecklists()
  const rows = layoutChecklists(checklists, category)
  const drafts = checklists.filter((c) => c.category === category && c.hasDraft).length

  return (
    <>
      <PageHeader title="Checklists" eyebrow="Factory defaults">
        {drafts > 0 && <span className="text-sm" style={{ color: 'var(--hf-muted)' }}>{drafts} draft{drafts === 1 ? '' : 's'} waiting to publish</span>}
      </PageHeader>
      <CategoryTabs current={category} order={CHECKLIST_CATEGORIES} hrefFor={(c) => `/checklists?category=${c}`} />
      <StageTimeline
        rows={rows}
        renderCell={(cell, row) => cell.checklist ? (
          <ChecklistChip
            href={`/checklists/${cell.checklist.id}`}
            step={cell.step}
            itemCount={cell.checklist.itemCount}
            version={cell.checklist.publishedNumber}
            hasDraft={cell.checklist.hasDraft}
            ariaLabel={`${category} ${row.label} ${cell.step}`}
          />
        ) : <EmptyCell step={cell.step} />}
      />
    </>
  )
}
