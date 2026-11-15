'use client'

import { Bar, BarChart, CartesianGrid, Legend, XAxis, YAxis } from 'recharts'
import type { ThroughputSeries, ThroughputStageKey } from '@hf/server'
import { stageColor } from '@hf/server/format'
import { ChartContainer, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/shadcn/chart'
import { ChartFigure } from './ChartFigure'
import { EmptyOverlay } from './EmptyOverlay'

/** Stage names as people say them; the data keeps the lowercase keys. */
const stageLabel = (stage: string) => (stage === 'qc' ? 'QC' : stage.charAt(0).toUpperCase() + stage.slice(1))

/**
 * Day bucket labels arrive as `"Sun 30 Aug"` — right for a bench screen, too
 * wide for seven of them across a 358px phone column (they collide). The
 * weekday is decoration once "d MMM" already disambiguates the week, so it's
 * the one part safe to drop at any width.
 */
const shortDayLabel = (label: string) => label.replace(/^[A-Za-z]{3} /, '')

const STAGE_ORDER: ThroughputStageKey[] = ['cutting', 'pasting', 'stitching', 'finishing', 'qc', 'packaging']

/**
 * Throughput per hour/day — a stacked bar per bucket, one series per stage.
 *
 * Hourly buckets run up to 24 wide, so only every third tick is shown
 * (`interval={2}`) to keep the axis readable; a day view has at most 7
 * buckets, so every label shows (`interval={0}`). Both are static per bucket
 * kind rather than a responsive computation — Recharts' own tick-thinning
 * doesn't know the bucket cadence carries meaning (every 3rd hour, not
 * "however many fit").
 */
export function ThroughputChart({
  series,
  labels,
  bucketKind,
}: {
  series: ThroughputSeries
  labels: string[]
  bucketKind: 'hour' | 'day'
}) {
  const ariaLabel = bucketKind === 'hour' ? 'Throughput per hour' : 'Throughput per day'
  const title = `Throughput per ${bucketKind}`
  const empty = labels.length === 0 || series.stages.every((s) => s.values.every((v) => v === 0))

  const config: ChartConfig = Object.fromEntries(
    STAGE_ORDER.map((key) => [key, { label: stageLabel(key), color: stageColor(key) }]),
  )

  const data = labels.map((label, i) => {
    const row: Record<string, string | number> = { label }
    for (const s of series.stages) row[s.key] = s.values[i] ?? 0
    return row
  })

  return (
    <ChartFigure title={title} ariaLabel={ariaLabel}>
      <div className="relative">
        <ChartContainer config={config} className="aspect-auto h-[220px] w-full">
          <BarChart data={data} margin={{ left: 4, right: 8 }}>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              interval={bucketKind === 'hour' ? 2 : 0}
              tickMargin={8}
              tickFormatter={bucketKind === 'day' ? shortDayLabel : undefined}
              domain={empty ? [0, 1] : undefined}
            />
            <YAxis tickLine={false} axisLine={false} allowDecimals={false} width={32} domain={empty ? [0, 1] : undefined} />
            {!empty && <ChartTooltip content={<ChartTooltipContent />} />}
            {!empty && <Legend content={<ChartLegendContent className="flex-wrap" />} />}
            {!empty &&
              STAGE_ORDER.map((key) => <Bar key={key} dataKey={key} stackId="stages" fill={`var(--color-${key})`} radius={0} />)}
          </BarChart>
        </ChartContainer>
        {empty && <EmptyOverlay />}
      </div>
    </ChartFigure>
  )
}
