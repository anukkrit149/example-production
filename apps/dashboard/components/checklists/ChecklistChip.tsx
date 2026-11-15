import Link from 'next/link'

/** A checklist on the timeline: step, size, live version, and a dot when a draft is waiting. */
export function ChecklistChip({ href, step, itemCount, version, hasDraft, ariaLabel, note }: {
  href: string; step: string; itemCount: number; version: number | null; hasDraft: boolean; ariaLabel: string; note?: string
}) {
  return (
    <Link href={href} aria-label={ariaLabel} className="grid min-w-[128px] gap-0.5 rounded-lg border px-3 py-2 hover:underline" style={{ borderColor: 'var(--hf-line)', background: 'var(--hf-card)' }}>
      <span className="flex items-center gap-2">
        <span className="hf-ui text-xs uppercase">{step}</span>
        {hasDraft && <span aria-label="draft waiting" title="Draft waiting" className="h-2 w-2 rounded-full" style={{ background: 'var(--hf-oxblood-lit)' }} />}
      </span>
      <span className="text-xs" style={{ color: 'var(--hf-muted)' }}>
        {note ? `${note} · ` : ''}{itemCount} item{itemCount === 1 ? '' : 's'}{version !== null ? ` · v${version}` : ' · unpublished'}
      </span>
    </Link>
  )
}

export function EmptyCell({ step }: { step: string }) {
  return (
    <span className="grid min-w-[128px] gap-0.5 rounded-lg border border-dashed px-3 py-2" style={{ borderColor: 'var(--hf-line)', color: 'var(--hf-muted)' }}>
      <span className="hf-ui text-xs uppercase">{step}</span>
      <span className="text-xs">no checklist</span>
    </span>
  )
}
