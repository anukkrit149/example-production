'use client'
import { useDictation } from '@/lib/use-dictation'
import { useT } from '@/lib/i18n/useT'

/** The mic beside a text field. Renders nothing where the browser has no `SpeechRecognition`. */
export function DictateButton({ onText }: { onText: (text: string) => void }) {
  const { t, lang } = useT()
  const { supported, listening, start, stop } = useDictation(lang, onText)
  if (!supported) return null
  return (
    <button
      type="button"
      aria-pressed={listening}
      aria-label={listening ? t('listening') : t('dictate')}
      onClick={listening ? stop : start}
      className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border-2"
      style={{
        borderColor: listening ? 'var(--hf-oxblood-lit)' : 'var(--hf-line)',
        background: 'var(--hf-card)',
        color: listening ? 'var(--hf-oxblood-lit)' : 'var(--hf-ink)',
      }}
    >
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="9" y="3" width="6" height="11" rx="3" stroke="currentColor" strokeWidth="1.8" />
        <path d="M5 11a7 7 0 0 0 14 0M12 18v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
      {listening && (
        <span aria-hidden className="ml-1 h-2 w-2 animate-pulse rounded-full" style={{ background: 'var(--hf-oxblood-lit)' }} />
      )}
    </button>
  )
}
