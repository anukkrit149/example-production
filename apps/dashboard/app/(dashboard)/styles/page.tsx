import Link from 'next/link'
import { STYLE_CATEGORIES } from '@hf/domain'
import { listOrganizations, listStyles } from '@hf/server'
import { CategoryTabs } from '@/components/checklists/CategoryTabs'
import { Drawer } from '@/components/Drawer'
import { StyleForm } from '@/components/forms/StyleForm'
import { Empty, PageHeader } from '@/components/ui'
import { pageUser } from '@/lib/page-user'
import { canWrite } from '@/lib/roles'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Styles · Sample Factory Dashboard' }

const TABS = ['all', ...STYLE_CATEGORIES] as const
type Tab = (typeof TABS)[number]
const isTab = (c: string | undefined): c is Tab => (TABS as readonly string[]).includes(c ?? '')

export default async function StylesPage({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  const { category } = await searchParams
  const user = await pageUser()
  const [styles, orgs] = await Promise.all([listStyles(), listOrganizations()])
  const owners = orgs.filter((o) => o.active && o.type === 'buyer')
  const current: Tab = isTab(category) ? category : 'all'
  const counts: Partial<Record<Tab, number>> = { all: styles.length }
  for (const c of STYLE_CATEGORIES) counts[c] = styles.filter((s) => s.category === c).length
  const shown = current === 'all' ? styles : styles.filter((s) => s.category === current)
  return (
    <>
      <PageHeader title="Styles">{canWrite(user) && <Drawer title="New style" trigger="New style"><StyleForm owners={owners} /></Drawer>}</PageHeader>
      <CategoryTabs current={current} order={TABS} counts={counts} hrefFor={(c) => `/styles?category=${c}`} />
      {shown.length === 0 ? <Empty>{current === 'all' ? 'No styles yet.' : `No ${current} styles yet.`}</Empty> : (
        <table className="hf-table hf-cards w-full">
          <thead><tr><th>Code</th><th>Category</th><th>Gender</th><th>Owner</th><th>Description</th><th className="hf-num">Line items</th><th>Active</th></tr></thead>
          <tbody>
            {shown.map((s) => (
              <tr key={s.id} style={{ opacity: s.active ? 1 : 0.6 }}>
                <td data-primary>
                  <span className="flex items-center gap-3">
                    {s.referencePhotoUrl
                      // eslint-disable-next-line @next/next/no-img-element -- signed, short-lived URL
                      ? <img src={s.referencePhotoUrl} alt="" width={48} height={48} className="h-12 w-12 shrink-0 rounded-md border object-cover" style={{ borderColor: 'var(--hf-line)' }} />
                      : <span aria-hidden className="h-12 w-12 shrink-0 rounded-md border border-dashed" style={{ borderColor: 'var(--hf-line)' }} />}
                    <Link href={`/styles/${s.id}`} className="font-mono font-semibold hover:underline">{s.styleCode}</Link>
                  </span>
                </td>
                <td data-label="Category">{s.category}</td><td data-label="Gender">{s.gender}</td>
                <td data-label="Owner" style={{ color: s.owner ? undefined : 'var(--hf-muted)' }}>{s.owner?.name ?? 'Factory'}</td>
                <td data-label="Description">{s.description ?? '—'}</td><td data-label="Line items" className="hf-num">{s.lineItems}</td><td data-label="Active">{s.active ? 'Yes' : 'No'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  )
}
