'use client'
import type { InputHTMLAttributes } from 'react'
import { DictateButton } from './DictateButton'
import { appendTranscript } from '@/lib/use-dictation'

const FIELD = 'min-h-14 w-full rounded-lg border-2 px-3 text-lg'
const STYLE = { borderColor: 'var(--hf-line)', background: 'var(--hf-paper)', color: 'var(--hf-ink)' } as const

/** The phone's text input: a label above, the field, and the microphone beside it. Numbers do not get a mic. */
export function TextField({
  label,
  value,
  onChange,
  dictate = true,
  mono,
  id,
  style,
  ...rest
}: {
  label: string
  value: string
  onChange: (v: string) => void
  dictate?: boolean
  mono?: boolean
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  const inputId = id ?? `tf-${label.replace(/\W+/g, '-').toLowerCase()}`
  return (
    <div className="grid gap-1">
      <label htmlFor={inputId} className="hf-label text-[10px]" style={{ color: 'var(--hf-muted)' }}>
        {label}
      </label>
      <div className="flex gap-2">
        <input
          id={inputId}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`${FIELD} ${mono ? 'font-mono' : ''}`}
          {...rest}
          // A caller's partial style (a warning border, say) layers over the shared look instead of replacing it.
          style={{ ...STYLE, ...style }}
        />
        {dictate && <DictateButton onText={(text) => onChange(appendTranscript(value, text))} />}
      </div>
    </div>
  )
}
