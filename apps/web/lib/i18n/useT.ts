'use client'
import { useCallback } from 'react'
import { translate, type Key } from './dictionary'
import { useLang } from './LanguageProvider'

export function useT() {
  const { lang } = useLang()
  const t = useCallback((key: Key, vars?: Record<string, string | number>) => translate(lang, key, vars), [lang])
  /** For content that carries both languages itself (checklist items). */
  const pick = useCallback((en: string, hi: string) => (lang === 'hi' ? hi : en), [lang])
  return { t, lang, pick }
}
