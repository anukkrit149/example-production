import { Badge } from '@/components/shadcn/badge'

/** Status is not a stage, so it never borrows a label colour. Discrepancy takes the accent. */
export function StatusBadge({ status }: { status: 'RECEIVED' | 'COUNTED' }) {
  return status === 'COUNTED'
    ? <Badge className="hf-ui rounded px-2 text-[11px] uppercase [background:var(--hf-ink)] [color:var(--hf-paper)]">Counted</Badge>
    : <Badge className="hf-ui rounded px-2 text-[11px] uppercase [background:var(--hf-line)] [color:var(--hf-ink)]">Waiting for count</Badge>
}
export function DiscrepancyBadge() {
  return <Badge className="hf-ui rounded px-2 text-[11px] uppercase [background:var(--hf-oxblood-deep)] [color:var(--hf-paper)]">Discrepancy</Badge>
}
