'use client'

import { Bar, BarChart, CartesianGrid, Legend, XAxis, YAxis } from 'recharts'
import type { QaByStage } from '@hf/server'
import { ChartContainer, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/shadcn/chart'
import { ChartFigure } from './ChartFigure'
import { EmptyOverlay } from './EmptyOverlay'

/** Stage names as people say them; the data keeps the lowercase keys. */
const stageLabel = (stage: string) => (stage === 'qc' ? 'QC' : stage.charAt(0).toUpperCase() + stage.slice(1))

// Green for accepted, the label stock's own red for rejected. Oxblood is the
// interface accent and never carries data.
const config: ChartConfig = {
  passed: { label: 'Passed', color: 'var(--hf-stage-finishing)' },
  failed: { label: 'Failed', color: 'var(--hf-stage-pasting)' },
}

/**
 * QA outcomes per stage — a stacked bar of passed/failed per stage, tooltip
 * carrying the reject rate so a reader doesn't have to do the division.
 */
export function QaChart({ qa }: { qa: QaByStage }) {
  const empty = qa.length === 0 || qa.every((s) => s.passed === 0 && s.failed === 0)

  const data = qa.map((s) => {
    const total = s.passed + s.failed
    return {
      stage: stageLabel(s.stage),
      passed: s.passed,
      failed: s.failed,
      rejectRate: total === 0 ? null : Math.round((100 * s.failed) / total),
    }
  })

  return (
    <ChartFigure title="QA outcomes per stage" ariaLabel="QA outcomes per stage">
      <div className="relative">
        <ChartContainer config={config} className="aspect-auto h-[220px] w-full">
          <BarChart data={data} margin={{ left: 4, right: 8 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="stage" tickLine={false} axisLine={false} tickMargin={8} domain={empty ? [0, 1] : undefined} />
            <YAxis tickLine={false} axisLine={false} allowDecimals={false} width={32} domain={empty ? [0, 1] : undefined} />
            {!empty && (
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(value, name, item) => (
                      <div className="flex w-full items-center justify-between gap-2">
                        <span className="flex items-center gap-1.5">
                          <span
                            className="inline-block h-2.5 w-2.5 shrink-0 rounded-[2px]"
                            style={{ background: name === 'passed' ? 'var(--hf-stage-finishing)' : 'var(--hf-stage-pasting)' }}
                          />
                          <span className="text-muted-foreground">{name === 'passed' ? 'Passed' : 'Failed'}</span>
                        </span>
                        <span className="font-mono font-medium tabular-nums">
                          {value}
                          {name === 'failed' && item.payload.rejectRate !== null ? ` · ${item.payload.rejectRate}% reject rate` : ''}
                        </span>
                      </div>
                    )}
                  />
                }
              />
            )}
            {!empty && <Legend content={<ChartLegendContent />} />}
            {!empty && <Bar dataKey="passed" stackId="qa" fill="var(--color-passed)" radius={0} />}
            {!empty && <Bar dataKey="failed" stackId="qa" fill="var(--color-failed)" radius={0} />}
          </BarChart>
        </ChartContainer>
        {empty && <EmptyOverlay />}
      </div>
    </ChartFigure>
  )
}
