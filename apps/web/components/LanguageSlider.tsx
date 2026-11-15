'use client'
import { useLang } from '@/lib/i18n/LanguageProvider'

/** Two positions, one tap. 44 px tall so it is a real target on the floor. */
export function LanguageSlider() {
  const { lang, setLang } = useLang()
  const seg = (l: 'hi' | 'en', label: string) => (
    <button type="button" onClick={() => setLang(l)} aria-pressed={lang === l}
      className="hf-ui h-11 min-w-12 rounded-full px-3 text-xs"
      style={lang === l ? { background: 'var(--hf-ink)', color: 'var(--hf-paper)' } : { color: 'var(--hf-ink)' }}>
      {label}
    </button>
  )
  return (
    <div role="group" aria-label="Language / भाषा" className="flex rounded-full border p-0.5" style={{ borderColor: 'var(--hf-line)', background: 'var(--hf-card)' }}>
      {seg('hi', 'हिं')}{seg('en', 'EN')}
    </div>
  )
}
