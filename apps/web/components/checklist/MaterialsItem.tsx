'use client'

import { useT } from '@/lib/i18n/useT'

export type Material = { code: string; qty: number; unit: string }

const FIELD = 'min-h-14 w-full rounded-lg border-2 px-3 text-lg'
const FIELD_STYLE = {
  borderColor: 'var(--hf-line)',
  background: 'var(--hf-paper)',
  color: 'var(--hf-ink)',
} as const

/**
 * What physically leaves the store room with the bundle, lifted out of the old
 * issue form so the materials check is just another screen in the stepper.
 *
 * Two lines per row, not four columns. At 390 px a single row of code,
 * quantity, unit and a delete button leaves the code field about 90 px wide —
 * too narrow to read "LIN-01" and its cursor at once. Code takes the full
 * width; quantity, unit and delete share the line under it, all still 56 px
 * tall.
 */
export function MaterialsItem({
  value,
  onChange,
}: {
  value: Material[]
  onChange: (rows: Material[]) => void
}) {
  const { t } = useT()

  const setRow = (i: number, patch: Partial<Material>) =>
    onChange(value.map((row, j) => (j === i ? { ...row, ...patch } : row)))

  return (
    <div className="grid gap-3">
      {value.length === 0 && (
        <p className="text-base" style={{ color: 'var(--hf-muted)' }}>
          {t('materials')} — {t('add_material').toLowerCase()}
        </p>
      )}

      {value.map((m, i) => (
        <div
          key={i}
          className="grid gap-2 rounded-lg border p-3"
          style={{ borderColor: 'var(--hf-line)', background: 'var(--hf-card)' }}
        >
          <label className="grid gap-1">
            <span className="hf-label text-[10px]" style={{ color: 'var(--hf-muted)' }}>
              {t('material_code')}
            </span>
            <input
              value={m.code}
              onChange={(e) => setRow(i, { code: e.target.value })}
              maxLength={32}
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              className={FIELD}
              style={FIELD_STYLE}
            />
          </label>

          <div className="grid grid-cols-[5.5rem_1fr_3.5rem] gap-2">
            <label className="grid gap-1">
              <span className="hf-label text-[10px]" style={{ color: 'var(--hf-muted)' }}>
                {t('qty')}
              </span>
              <input
                type="number"
                inputMode="decimal"
                min={0.01}
                step="any"
                value={m.qty}
                onChange={(e) => setRow(i, { qty: Number(e.target.value) })}
                className={FIELD}
                style={FIELD_STYLE}
              />
            </label>

            <label className="grid gap-1">
              <span className="hf-label text-[10px]" style={{ color: 'var(--hf-muted)' }}>
                {t('unit')}
              </span>
              <input
                value={m.unit}
                onChange={(e) => setRow(i, { unit: e.target.value })}
                maxLength={16}
                className={FIELD}
                style={FIELD_STYLE}
              />
            </label>

            <div className="grid gap-1">
              <span className="hf-label text-[10px]" aria-hidden="true">
                &nbsp;
              </span>
              <button
                type="button"
                onClick={() => onChange(value.filter((_, j) => j !== i))}
                aria-label={`${t('remove')} ${m.code}`.trim()}
                className="flex min-h-14 items-center justify-center rounded-lg border-2 text-2xl"
                style={{
                  borderColor: 'var(--hf-line)',
                  background: 'var(--hf-paper)',
                  color: 'var(--hf-oxblood-deep)',
                }}
              >
                ×
              </button>
            </div>
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={() => onChange([...value, { code: '', qty: 1, unit: 'pc' }])}
        className="hf-ui flex min-h-14 w-full items-center justify-center rounded-lg border-2 border-dashed px-4 text-base uppercase"
        style={{ borderColor: 'var(--hf-line)', background: 'var(--hf-card)', color: 'var(--hf-ink)' }}
      >
        {t('add_material')}
      </button>
    </div>
  )
}
