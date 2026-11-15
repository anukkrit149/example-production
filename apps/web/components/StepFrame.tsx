'use client'
import type { ReactNode } from 'react'
import { Pictogram } from '@/components/Pictogram'
import { useT } from '@/lib/i18n/useT'

/** One job per screen: dots, the picture, the sentence, then whatever control the step needs. */
export function StepFrame({
  index,
  total,
  pictogram,
  title,
  children,
  onBack,
  footer,
}: {
  index: number
  total: number
  pictogram: string
  title: string
  children: ReactNode
  onBack?: () => void
  footer?: ReactNode
}) {
  const { t } = useT()
  return (
    <section
      className="grid gap-5 rounded-xl border p-4"
      style={{ borderColor: 'var(--hf-line)', background: 'var(--hf-card)' }}
      aria-live="polite"
    >
      <div className="flex items-center justify-between">
        <span className="hf-label text-[10px]" style={{ color: 'var(--hf-muted)' }}>
          {t('step_of', { n: index + 1, total })}
        </span>
        <span aria-hidden className="flex gap-1">
          {Array.from({ length: total }).map((_, i) => (
            <span
              key={i}
              className="h-2 w-2 rounded-full"
              style={{ background: i <= index ? 'var(--hf-ink)' : 'var(--hf-line)' }}
            />
          ))}
        </span>
      </div>
      <div className="grid justify-items-center gap-4">
        <Pictogram name={pictogram} size={200} />
        <p className="text-center text-2xl font-semibold leading-snug">{title}</p>
      </div>
      {children}
      {footer}
      {onBack && (
        <button type="button" onClick={onBack} className="hf-ui text-base underline" style={{ color: 'var(--hf-muted)' }}>
          {t('back')}
        </button>
      )}
    </section>
  )
}
