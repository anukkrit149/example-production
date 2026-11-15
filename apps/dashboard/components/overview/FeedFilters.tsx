'use client'
import { useRouter } from 'next/navigation'
import { PIECE_EVENT_TYPES } from '@hf/domain'
import { formatEventType } from '@hf/server/format'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/shadcn/select'

export type FeedFilterValues = {
  workerId?: string
  orderId?: string
  eventType?: string
  period?: string
  date?: string
  labels?: string
}

/**
 * The value Radix carries for "no filter".
 *
 * A `SelectItem` cannot have an empty `value` — Radix reserves that for the
 * placeholder — so "All workers" travels as this sentinel and is deleted from
 * the query string rather than written into it.
 */
const ALL = '__all__'

/** A label the reader will see, so it is what `getByRole('combobox', { name })` finds. */
type Choice = { value: string; label: string }

/**
 * Three dropdowns that navigate the moment they change.
 *
 * There is no Apply button: picking a worker *is* the request, and a button
 * between the two only lets a supervisor stare at a filter that has not taken
 * effect. Every change goes through the URL, so the filtered feed is still a
 * link someone can send.
 *
 * `before` is deliberately dropped on every change. It is a cursor minted for
 * the previous query; carrying it across a filter change would resume paging
 * from a place that no longer exists in the new result, and the reader would
 * land in the middle of a feed they have not seen the top of.
 */
export function FeedFilters({
  filters,
  workers,
  orders,
}: {
  filters: FeedFilterValues
  workers: Array<{ id: string; name: string }>
  orders: Array<{ id: string; orderNumber: string }>
}) {
  const router = useRouter()

  const go = (key: 'workerId' | 'orderId' | 'eventType', value: string) => {
    const next = new URLSearchParams()
    // The period and the chosen day belong to the tiles and graphs above, so
    // they survive a feed filter change; the cursor does not.
    for (const k of ['period', 'date', 'labels'] as const) if (filters[k]) next.set(k, filters[k]!)
    for (const k of ['workerId', 'orderId', 'eventType'] as const) {
      const v = k === key ? value : filters[k]
      if (v && v !== ALL) next.set(k, v)
    }
    const qs = next.toString()
    router.push(qs ? `/overview?${qs}` : '/overview', { scroll: false })
  }

  const workerChoices: Choice[] = workers.map((w) => ({ value: w.id, label: w.name }))
  const orderChoices: Choice[] = orders.map((o) => ({ value: o.id, label: o.orderNumber }))
  const eventChoices: Choice[] = PIECE_EVENT_TYPES.map((t) => ({ value: t, label: formatEventType(t) }))

  return (
    <div className="mb-4 flex flex-wrap items-end gap-3">
      <Filter label="Worker" all="All workers" choices={workerChoices} value={filters.workerId} onChange={(v) => go('workerId', v)} />
      <Filter label="Order" all="All orders" choices={orderChoices} value={filters.orderId} onChange={(v) => go('orderId', v)} />
      <Filter label="Event" all="All events" choices={eventChoices} value={filters.eventType} onChange={(v) => go('eventType', v)} />
    </div>
  )
}

/**
 * One labelled dropdown.
 *
 * The `<label>` is linked by id rather than wrapping the trigger: a wrapping
 * label folds the selected option's text into the accessible name, which
 * breaks an exact `getByRole('combobox', { name: 'Worker' })` lookup the
 * moment someone picks a worker.
 */
function Filter({
  label,
  all,
  choices,
  value,
  onChange,
}: {
  label: string
  all: string
  choices: Choice[]
  value: string | undefined
  onChange: (value: string) => void
}) {
  const id = `activity-${label.toLowerCase()}`
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="hf-label" style={{ color: 'var(--hf-muted)' }}>
        {label}
      </label>
      <Select value={value ?? ALL} onValueChange={onChange}>
        <SelectTrigger
          id={id}
          className="h-9 w-44 rounded-md border px-3 text-sm [background:var(--hf-card)] [border-color:var(--hf-line)]"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{all}</SelectItem>
          {choices.map((c) => (
            <SelectItem key={c.value} value={c.value}>
              {c.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
