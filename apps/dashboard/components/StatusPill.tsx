import type { DerivedStatus } from '@hf/domain'

const LABEL: Record<DerivedStatus, string> = { not_started: 'Not started', in_production: 'In production', overdue: 'Overdue', complete: 'Complete' }

/** Status is not a stage, so it never borrows a label colour. Overdue takes the accent. */
export function StatusPill({ status }: { status: DerivedStatus }) {
  const style =
    status === 'overdue'
      ? { background: 'var(--hf-oxblood-deep)', color: 'var(--hf-paper)' }
      : status === 'in_production'
        ? { background: 'var(--hf-ink)', color: 'var(--hf-paper)' }
        : { background: 'var(--hf-line)', color: 'var(--hf-ink)' }
  return <span className="hf-ui inline-block rounded px-2 py-0.5 text-[11px] uppercase" style={style}>{LABEL[status]}</span>
}
