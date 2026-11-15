'use client'
import { format, parseISO } from 'date-fns'
import { CalendarIcon } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { OverviewPeriod } from '@hf/server'
import { Button } from '@/components/shadcn/button'
import { Calendar } from '@/components/shadcn/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/shadcn/popover'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/shadcn/tabs'

const TABS = [
  ['today', 'Today'],
  ['week', 'This week'],
  ['7d', 'Last 7 days'],
] as const

/**
 * The feed filter keys `PeriodBar` must preserve across a period change —
 * the same keys `FeedFilters.tsx`'s own `go()` carries forward, minus
 * `before`: a period change is a new window, so any page cursor minted for
 * the old one is stale.
 */
type PeriodBarFilters = { workerId?: string; orderId?: string; eventType?: string; labels?: string }

function withFilters(qs: URLSearchParams, filters: PeriodBarFilters | undefined) {
  if (!filters) return
  for (const k of ['workerId', 'orderId', 'eventType', 'labels'] as const) if (filters[k]) qs.set(k, filters[k]!)
}

/** A `yyyy-MM-dd` Kolkata date as the local `Date` react-day-picker draws its grid in. */
const asLocalDay = (date: string) => parseISO(`${date}T00:00:00`)

/** Oxblood on the active tab only: its label and the underline the tabs draw with `after:`. */
const TAB_CLASS = 'hf-ui px-3 text-xs uppercase data-[state=active]:text-oxblood data-[state=active]:after:bg-oxblood'

/**
 * Three tabs and a day picker, all of it in the URL.
 *
 * A period is a place, so every control ends in a navigation: `router.push`
 * writes the query string and the server re-renders, which keeps a period
 * surviving a reload, a bookmark and a shared message.
 *
 * The old bar picked a day with a native `<input type="date">`, and it never
 * took a selection: the 30-second auto-refresh re-rendered the page underneath
 * the browser's own date popup, which dismissed it. Radix's popover lives in
 * this tree, so `AutoRefresh` can see that it is open and hold the tick (D4).
 *
 * The picker's ceiling is `period.today` — the Kolkata date the server resolved
 * this request against. A `new Date()` here would be the *browser's* today, and
 * a laptop in another timezone would grey out a day the factory has worked.
 *
 * Oxblood shows only as the active tab. It is interface chrome, not data; the
 * stage colours further down the page own everything else.
 */
export function PeriodBar({ period, filters }: { period: OverviewPeriod; filters?: PeriodBarFilters }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const selected = period.date ? asLocalDay(period.date) : undefined

  return (
    <div
      className="mb-6 flex flex-col gap-4 border-b pb-4 md:flex-row md:items-center md:justify-between"
      style={{ borderColor: 'var(--hf-line)' }}
    >
      <Tabs
        value={period.kind}
        onValueChange={(kind) => {
          // The day tab is only ever the current one, so it has nowhere to
          // navigate to; re-pushing its URL would be a no-op re-render.
          if (kind === 'day') return
          const qs = new URLSearchParams({ period: kind })
          withFilters(qs, filters)
          router.push(`/overview?${qs.toString()}`)
        }}
      >
        <TabsList variant="line" aria-label="Period" className="h-auto flex-wrap">
          {TABS.map(([kind, label]) => (
            <TabsTrigger key={kind} value={kind} className={TAB_CLASS}>
              {label}
            </TabsTrigger>
          ))}
          {period.kind === 'day' && (
            // A chosen day is a fourth tab that only exists while it is chosen
            // — without it the bar would show no active period at all.
            <TabsTrigger value="day" className={TAB_CLASS}>
              {period.label}
            </TabsTrigger>
          )}
        </TabsList>
        {/*
          Every `TabsTrigger` above emits `aria-controls` pointing at a panel
          with a matching id — Radix wires that up whether or not the panel
          is rendered. Without a `TabsContent` for each value, that id never
          exists in the DOM, so `aria-controls` references nothing. These are
          `forceMount` (the tab's own content lives elsewhere on the page, not
          inside the tab) and hidden, existing solely so the ids resolve.
        */}
        {TABS.map(([kind]) => (
          <TabsContent key={kind} value={kind} forceMount className="hidden" />
        ))}
        {period.kind === 'day' && <TabsContent value="day" forceMount className="hidden" />}
      </Tabs>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="justify-start font-normal md:w-44">
            <CalendarIcon aria-hidden />
            {period.date ? period.label : 'Pick a day'}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-auto p-0">
          <Calendar
            mode="single"
            autoFocus
            selected={selected}
            defaultMonth={selected ?? asLocalDay(period.today)}
            disabled={{ after: asLocalDay(period.today) }}
            onSelect={(date) => {
              if (!date) return
              setOpen(false)
              const qs = new URLSearchParams({ period: 'day', date: format(date, 'yyyy-MM-dd') })
              withFilters(qs, filters)
              router.push(`/overview?${qs.toString()}`)
            }}
          />
        </PopoverContent>
      </Popover>
    </div>
  )
}
