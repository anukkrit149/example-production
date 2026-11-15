'use client'
import { Button } from '../ui'
import type { EditorRow } from './ChecklistEditor'

const KIND_LABEL: Record<EditorRow['kind'], string> = { confirm: 'confirm', photo: 'photo', materials: 'materials', measure: 'measure' }

/** The left pane: every item in one line each, the selected one marked. */
export function ItemList({ rows, selected, onSelect, onMove, onRemove, onAdd }: {
  rows: EditorRow[]; selected: number
  onSelect: (i: number) => void; onMove: (i: number, dir: -1 | 1) => void; onRemove: (i: number) => void; onAdd: () => void
}) {
  return (
    <div className="grid min-w-0 gap-2">
      {/* min-w-0 down the chain: a grid item's default min-width is its
          content's, so without it a long English line widens the whole
          left pane past its column instead of truncating. */}
      <ol className="grid min-w-0 gap-1" aria-label="Items">
        {rows.map((row, i) => (
          <li key={i} className="flex min-w-0 items-center gap-2 rounded-lg border px-2 py-1.5" style={{ borderColor: i === selected ? 'var(--hf-oxblood-lit)' : 'var(--hf-line)', background: 'var(--hf-card)' }}>
            <button type="button" onClick={() => onSelect(i)} aria-current={i === selected ? 'true' : undefined} className="flex min-w-0 flex-1 items-center gap-3 text-left">
              <span className="hf-num w-5 text-xs" style={{ color: 'var(--hf-muted)' }}>{i + 1}</span>
              {/* eslint-disable-next-line @next/next/no-img-element -- static, ink-on-transparent SVG asset */}
              <img src={`/pictograms/${row.pictogram}.svg`} alt="" width={24} height={24} style={{ width: 24, height: 24 }} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{row.textEn.trim() || <em style={{ color: 'var(--hf-muted)' }}>Untitled item</em>}</span>
                <span className="hf-label block" style={{ color: 'var(--hf-muted)' }}>{KIND_LABEL[row.kind]}</span>
              </span>
            </button>
            <div className="flex shrink-0 items-center gap-1">
              <Button type="button" variant="ghost" className="h-8 w-8 !px-0" onClick={() => onMove(i, -1)} disabled={i === 0} aria-label={`Move item ${i + 1} up`}>↑</Button>
              <Button type="button" variant="ghost" className="h-8 w-8 !px-0" onClick={() => onMove(i, 1)} disabled={i === rows.length - 1} aria-label={`Move item ${i + 1} down`}>↓</Button>
              <Button type="button" variant="danger" className="h-8 !px-2" onClick={() => onRemove(i)} disabled={rows.length === 1} aria-label={`Remove item ${i + 1}`}>×</Button>
            </div>
          </li>
        ))}
      </ol>
      <div><Button type="button" variant="ghost" onClick={onAdd} disabled={rows.length >= 20}>Add item</Button></div>
    </div>
  )
}
