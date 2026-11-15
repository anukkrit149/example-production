import type { ChecklistVersionRow } from '@hf/server'
import { formatKolkata } from '@hf/server/format'

export function VersionHistory({ versions }: { versions: ChecklistVersionRow[] }) {
  return (
    <section aria-label="History" className="grid gap-2">
      <h3 className="hf-label" style={{ color: 'var(--hf-muted)' }}>History</h3>
      <ol className="grid gap-1 text-sm">
        {versions.map((v) => (
          <li key={v.id} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b py-2" style={{ borderColor: 'var(--hf-line)' }}>
            <span className="hf-num font-semibold">v{v.number}</span>
            <span style={{ color: 'var(--hf-muted)' }}>{v.publishedAt ? `published ${formatKolkata(v.publishedAt)}` : 'draft'}</span>
            <span style={{ color: 'var(--hf-muted)' }}>{v.publishedBy ? `by ${v.publishedBy}` : ''}</span>
            <span className="hf-num" style={{ color: 'var(--hf-muted)' }}>{v.itemCount} item{v.itemCount === 1 ? '' : 's'}</span>
          </li>
        ))}
      </ol>
    </section>
  )
}
