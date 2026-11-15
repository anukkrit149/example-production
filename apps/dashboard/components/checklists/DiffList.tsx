import type { ItemChange } from '@hf/domain'
import { formatMeasureRange } from './measure-format'

const LABEL: Record<ItemChange['type'], string> = { added: 'Added', removed: 'Removed', reworded: 'Reworded', moved: 'Moved', unchanged: 'Unchanged' }
const RANGE_FIELDS = new Set(['unit', 'min', 'max'])

/** Publishing, item by item. Unchanged items are listed too, muted, so the reviewer sees the whole list the floor will get. */
export function DiffList({ changes }: { changes: ItemChange[] }) {
  return (
    <ol className="grid gap-2" aria-label="Changes">
      {changes.map((c, i) => {
        const muted = c.type === 'unchanged'
        const item = c.type === 'added' ? c.to : c.type === 'removed' ? c.from : c.type === 'reworded' ? c.to : c.item
        return (
          <li key={i} className="grid grid-cols-[88px_1fr] items-start gap-3 rounded-lg border px-3 py-2 text-sm" style={{ borderColor: 'var(--hf-line)', background: muted ? 'transparent' : 'var(--hf-card)', opacity: muted ? 0.7 : 1 }}>
            <span className="hf-ui pt-0.5 text-[11px] uppercase" style={{ color: c.type === 'removed' ? 'var(--hf-oxblood-deep)' : 'var(--hf-muted)' }}>{LABEL[c.type]}</span>
            <span className="grid gap-0.5">
              <span className={c.type === 'removed' ? 'line-through' : ''}>{item.textEn} <span lang="hi" style={{ color: 'var(--hf-muted)' }}>· {item.textHi}</span></span>
              {c.type === 'reworded' && <span className="text-xs" style={{ color: 'var(--hf-muted)' }}>was: {c.from.textEn} · <span lang="hi">{c.from.textHi}</span> · {c.from.pictogram} · {c.from.kind}</span>}
              {c.type === 'reworded' && c.fields.some((f) => RANGE_FIELDS.has(f)) && (
                <span className="text-xs" style={{ color: 'var(--hf-muted)' }}>
                  {formatMeasureRange(c.from.min, c.from.max, c.from.unit)} → {formatMeasureRange(c.to.min, c.to.max, c.to.unit)}
                </span>
              )}
              {c.type !== 'reworded' && item.kind === 'measure' && (
                <span className="text-xs" style={{ color: 'var(--hf-muted)' }}>{formatMeasureRange(item.min, item.max, item.unit)}</span>
              )}
              {c.type === 'moved' && <span className="text-xs" style={{ color: 'var(--hf-muted)' }}>from position {c.from} to {c.to}</span>}
              <span className="text-xs" style={{ color: 'var(--hf-muted)' }}>{item.kind} · {item.pictogram}</span>
            </span>
          </li>
        )
      })}
    </ol>
  )
}
