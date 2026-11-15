'use client'
import { useRouter } from 'next/navigation'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/shadcn/select'

export type ReceiptFilterValues = { status?: string; discrepancy?: string }
const ALL = '__all__'

/** Two dropdowns that navigate on change and keep the scroll position; the filtered list stays a link someone can send. */
export function ReceiptFilters({ filters }: { filters: ReceiptFilterValues }) {
  const router = useRouter()
  const go = (key: keyof ReceiptFilterValues, value: string) => {
    const next = new URLSearchParams()
    for (const k of ['status', 'discrepancy'] as const) {
      const v = k === key ? value : filters[k]
      if (v && v !== ALL) next.set(k, v)
    }
    const qs = next.toString()
    router.push(qs ? `/inventory?${qs}` : '/inventory', { scroll: false })
  }
  return (
    <div className="mb-4 flex flex-wrap items-end gap-3">
      <Filter id="receipts-status" label="Status" value={filters.status} onChange={(v) => go('status', v)} choices={[[ALL, 'All receipts'], ['RECEIVED', 'Waiting for count'], ['COUNTED', 'Counted']]} />
      <Filter id="receipts-flagged" label="Flagged" value={filters.discrepancy} onChange={(v) => go('discrepancy', v)} choices={[[ALL, 'All'], ['1', 'Flagged only']]} />
    </div>
  )
}

function Filter({ id, label, value, onChange, choices }: { id: string; label: string; value: string | undefined; onChange: (v: string) => void; choices: Array<[string, string]> }) {
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="hf-label" style={{ color: 'var(--hf-muted)' }}>{label}</label>
      <Select value={value ?? ALL} onValueChange={onChange}>
        <SelectTrigger id={id} className="h-9 w-48 rounded-md border px-3 text-sm [background:var(--hf-card)] [border-color:var(--hf-line)]"><SelectValue /></SelectTrigger>
        <SelectContent>{choices.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  )
}
