import type { ReactNode } from 'react'
import type { LayoutCell, LayoutInput, LayoutRow } from '@hf/domain'

/**
 * The floor top to bottom: one row per point in production, its checklists
 * as chips. Works as a server component and inside a client component, so
 * the caller decides what a cell is (a link on the factory index, a chip
 * with buttons on the program page).
 */
export function StageTimeline<T extends LayoutInput>({ rows, renderCell }: { rows: LayoutRow<T>[]; renderCell: (cell: LayoutCell<T>, row: LayoutRow<T>) => ReactNode }) {
  return (
    <ol className="grid gap-px" aria-label="Stage timeline">
      {rows.map((row) => (
        <li key={row.key} className="grid items-start gap-2 border-b py-3 md:grid-cols-[120px_1fr] md:gap-6" style={{ borderColor: 'var(--hf-line)' }}>
          <div className="hf-label pt-2" style={{ color: 'var(--hf-muted)' }}>{row.label}</div>
          <div className="flex flex-wrap gap-2">
            {row.cells.map((cell) => <div key={cell.step}>{renderCell(cell, row)}</div>)}
          </div>
        </li>
      ))}
    </ol>
  )
}
