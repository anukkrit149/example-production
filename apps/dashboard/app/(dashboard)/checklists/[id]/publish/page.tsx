import Link from 'next/link'
import { notFound } from 'next/navigation'
import { diffChecklistItems } from '@hf/domain'
import { getChecklist, resolveChecklistVersion } from '@hf/server'
import { DiffList } from '@/components/checklists/DiffList'
import { FlipThrough } from '@/components/checklists/FlipThrough'
import { PublishButton } from '@/components/checklists/PublishButton'
import { VersionHistory } from '@/components/checklists/VersionHistory'
import { Empty, PageHeader } from '@/components/ui'
import { pageUser } from '@/lib/page-user'
import { isAdmin } from '@/lib/roles'

export const dynamic = 'force-dynamic'

export default async function PublishPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await pageUser()
  if (!isAdmin(user)) notFound()
  const { id } = await params
  const detail = await getChecklist(id).catch(() => null)
  if (!detail) notFound()
  const title = `${detail.category} · ${detail.stage ? `${detail.stage} · ` : ''}${detail.step}`
  const back = <Link href={`/checklists/${id}`} className="hover:underline">← Back to the editor</Link>

  if (!detail.draft) {
    return (
      <>
        <PageHeader eyebrow="Review & publish" title={title}>{back}</PageHeader>
        <Empty>Nothing to publish: there is no draft. {detail.published ? `Version ${detail.published.number} is live.` : 'This checklist has never been published.'}</Empty>
        <div className="mt-6"><VersionHistory versions={detail.versions} /></div>
      </>
    )
  }

  // What the draft is compared against: this list's own live version, or — for
  // a program override that has never been published — the factory default it
  // was copied from, so the first review shows what the program changes rather
  // than every item as "Added".
  const factoryDefault = !detail.published && detail.programId
    ? await resolveChecklistVersion({ step: detail.step, stage: detail.stage, category: detail.category, programId: null })
    : null
  const baseline = detail.published ?? factoryDefault
  const changes = diffChecklistItems(baseline?.items ?? [], detail.draft.items)
  const changed = changes.filter((c) => c.type !== 'unchanged').length
  const heading = detail.published
    ? `Changes from v${detail.published.number}: ${changed} of ${changes.length} items`
    : factoryDefault
      ? `Changes from the factory default v${factoryDefault.number}: ${changed} of ${changes.length} items`
      : 'First version'

  return (
    <>
      <PageHeader eyebrow="Review & publish" title={title}>{back}</PageHeader>
      <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr]">
        <div className="grid gap-6">
          <section className="grid gap-2">
            <h3 className="hf-label" style={{ color: 'var(--hf-muted)' }}>
              {heading}
            </h3>
            <DiffList changes={changes} />
          </section>
          <PublishButton id={id} nextNumber={detail.draft.number} />
          <VersionHistory versions={detail.versions} />
        </div>
        <FlipThrough items={detail.draft.items} />
      </div>
    </>
  )
}
