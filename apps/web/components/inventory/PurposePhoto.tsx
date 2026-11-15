'use client'
import { PhotoCapture } from '@/components/PhotoCapture'
import { useT } from '@/lib/i18n/useT'
import type { PhotoPurpose } from '@/lib/inventory-client'

/**
 * One of the three photo blocks on the receive screen. `onNew` fires once per
 * attachment id that was not there before, which is what starts a suggestion
 * for the goods and document photos.
 */
export function PurposePhoto({ purpose, label, value, onChange, onNew, reading, noSuggestion }: {
  purpose: PhotoPurpose; label: string; value: string[]; onChange: (ids: string[]) => void; onNew?: (id: string) => void; reading?: boolean; noSuggestion?: boolean
}) {
  const { t } = useT()
  return (
    <section className="grid gap-2" data-purpose={purpose}>
      <h2 className="hf-label text-[10px]" style={{ color: 'var(--hf-muted)' }}>{label}</h2>
      <PhotoCapture
        value={value}
        required
        onChange={(ids) => {
          const added = ids.filter((id) => !value.includes(id))
          onChange(ids)
          if (onNew) added.forEach(onNew)
        }}
      />
      {reading && <p aria-live="polite" className="text-base" style={{ color: 'var(--hf-muted)' }}>{t('inv_reading')}</p>}
      {noSuggestion && <p className="text-base" style={{ color: 'var(--hf-muted)' }}>{t('inv_no_suggestion')}</p>}
    </section>
  )
}
