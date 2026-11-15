'use client'

import { Bar, BarChart, CartesianGrid, Cell, LabelList, XAxis, YAxis } from 'recharts'
import type { WorkerLoad } from '@hf/server'
import { stageColor } from '@hf/server/format'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/shadcn/chart'
import { ChartFigure } from './ChartFigure'
import { EmptyOverlay } from './EmptyOverlay'

const ROW_H = 28

/** Worker `type` → the stage whose colour speaks for that role on the floor. */
const TYPE_STAGE: Record<string, string> = {
  cutter: 'cutting',
  paster: 'pasting',
  tailor: 'stitching',
  finisher: 'finishing',
}
const typeStage = (type: string) => TYPE_STAGE[type] ?? 'packaging'

const config: ChartConfig = {
  pieces: { label: 'Pieces' },
}

/**
 * Pieces per worker — a horizontal bar per worker, longest first, bar coloured
 * by the worker's role. `LabelList` puts the count at the bar end so the
 * number reads without a tooltip; the chart's height grows with the row
 * count rather than squeezing a fixed height (mirrors the old HBars).
 */
export function WorkerChart({ workers }: { workers: WorkerLoad[] }) {
  const empty = workers.length === 0
  const height = Math.max(ROW_H * 3, workers.length * ROW_H + 24)

  const data = workers.map((w) => ({ id: w.workerId, name: w.name, pieces: w.pieces, type: w.type, color: stageColor(typeStage(w.type)) }))

  return (
    <ChartFigure title="Pieces per worker" ariaLabel="Pieces per worker">
      <div className="relative">
        <ChartContainer config={config} className="aspect-auto w-full" style={{ height }}>
          <BarChart data={data} layout="vertical" margin={{ left: 4, right: 24 }}>
            <CartesianGrid horizontal={false} />
            <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} domain={empty ? [0, 1] : undefined} />
            <YAxis
              type="category"
              dataKey="name"
              tickLine={false}
              axisLine={false}
              width={96}
              domain={empty ? [0, 1] : undefined}
            />
            {!empty && (
              <ChartTooltip cursor={false} content={<ChartTooltipContent labelFormatter={(_value, item) => String(item?.[0]?.payload?.name ?? '')} />} />
            )}
            {!empty && (
              <Bar dataKey="pieces" radius={2}>
                {data.map((row) => (
                  <Cell key={row.id} fill={row.color} />
                ))}
                <LabelList dataKey="pieces" position="right" className="fill-foreground" fontSize={11} />
              </Bar>
            )}
          </BarChart>
        </ChartContainer>
        {empty && <EmptyOverlay />}
      </div>
    </ChartFigure>
  )
}
