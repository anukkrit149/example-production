'use client'
import { useT } from '@/lib/i18n/useT'
import type { ItemRow } from '@/lib/inventory-client'

/** Tap to tick. A suggested chip says so; a chip the paper gave a number for shows it. */
export function ItemChips({ items, picked, suggested, expected, onToggle }: {
  items: ItemRow[]; picked: Set<string>; suggested: Set<string>; expected: Record<string, number>; onToggle: (id: string) => void
}) {
  const { t, pick } = useT()
  return (
    <ul className="grid grid-cols-2 gap-2" aria-label={t('inv_items')}>
      {items.map((i) => {
        const on = picked.has(i.id)
        return (
          <li key={i.id}>
            <button
              type="button"
              aria-pressed={on}
              onClick={() => onToggle(i.id)}
              className="grid min-h-16 w-full gap-0.5 rounded-lg border-2 px-3 py-2 text-left"
              style={on
                ? { borderColor: 'var(--hf-oxblood-lit)', background: 'var(--hf-oxblood-lit)', color: 'var(--hf-paper)' }
                : { borderColor: 'var(--hf-line)', background: 'var(--hf-card)', color: 'var(--hf-ink)' }}
            >
              <span className="font-mono text-base font-semibold">{i.code}</span>
              <span className="text-sm">{pick(i.nameEn, i.nameHi)}</span>
              {suggested.has(i.id) && <span className="hf-label text-[10px]">{t('inv_suggested')}</span>}
              {expected[i.id] !== undefined && <span className="text-sm">{t('inv_receipt_says', { n: expected[i.id]! })}</span>}
            </button>
          </li>
        )
      })}
    </ul>
  )
}
