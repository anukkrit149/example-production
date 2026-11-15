'use client'

import { format, parseISO } from 'date-fns'
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, XAxis, YAxis } from 'recharts'
import type { Cumulative } from '@hf/server'
import { ChartContainer, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/shadcn/chart'
import { ChartFigure } from './ChartFigure'
import { EmptyOverlay } from './EmptyOverlay'

/**
 * The Kolkata calendar date, client-side. This mirrors `kolkataDate` in
 * `@hf/server/overview` (a fixed +05:30 offset, no DST) but stays a local copy
 * rather than importing the real one — that module pulls in `@hf/db` and
 * Prisma, which must never end up in a client bundle.
 */
const kolkataDateToday = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10)

const config: ChartConfig = {
  packed: { label: 'Packed', color: 'var(--hf-ink)' },
  ordered: { label: 'Ordered', color: 'var(--hf-muted)' },
  projection: { label: 'Projected at the current factory rate', color: 'var(--hf-muted)' },
}

/**
 * Packed against ordered, with the run-rate projection dashed and starting
 * today. `null` projection values (every day already behind us) leave gaps
 * rather than drawing a flat line back to zero — Recharts' `connectNulls`
 * defaults to false, which is what we want here.
 */
export function CumulativeChart({ cumulative }: { cumulative: Cumulative }) {
  const empty = cumulative.days.length === 0
  const today = kolkataDateToday()

  const data = cumulative.days.map((day, i) => ({
    day,
    packed: cumulative.packed[i] ?? 0,
    ordered: cumulative.ordered,
    projection: cumulative.projection[i] ?? null,
  }))

  return (
    <ChartFigure title="Packed against ordered · projected at the current factory rate" ariaLabel="Packed against ordered">
      <div className="relative">
        <ChartContainer config={config} className="aspect-auto h-[220px] w-full">
          <LineChart data={data} margin={{ top: 16, left: 4, right: 8 }}>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="day"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={24}
              tickFormatter={(d: string) => format(parseISO(d), 'd MMM')}
              domain={empty ? [0, 1] : undefined}
            />
            <YAxis tickLine={false} axisLine={false} allowDecimals={false} width={40} domain={empty ? [0, 1] : undefined} />
            {!empty && (
              <ChartTooltip
                content={<ChartTooltipContent labelFormatter={(d) => format(parseISO(String(d)), 'd MMM')} />}
              />
            )}
            {!empty && <Legend content={<ChartLegendContent />} />}
            {!empty && (
              <ReferenceLine
                x={today}
                stroke="var(--hf-muted)"
                strokeDasharray="3 3"
                label={{ value: 'today', position: 'top', fill: 'var(--hf-muted)', fontSize: 10 }}
              />
            )}
            {!empty && <Line type="monotone" dataKey="packed" stroke="var(--color-packed)" dot={false} strokeWidth={2} />}
            {!empty && (
              <Line type="monotone" dataKey="ordered" stroke="var(--color-ordered)" dot={false} strokeWidth={1.5} />
            )}
            {!empty && (
              <Line
                type="monotone"
                dataKey="projection"
                stroke="var(--color-projection)"
                dot={false}
                strokeWidth={1.5}
                strokeDasharray="4 3"
              />
            )}
          </LineChart>
        </ChartContainer>
        {empty && <EmptyOverlay />}
      </div>
    </ChartFigure>
  )
}
