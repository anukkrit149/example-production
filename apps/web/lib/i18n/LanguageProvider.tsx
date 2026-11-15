'use client'
import { createContext, useCallback, useContext, useSyncExternalStore, type ReactNode } from 'react'
import type { Lang } from './dictionary'

const STORAGE_KEY = 'hf_lang'
const listeners = new Set<() => void>()
const read = (): Lang => { try { return localStorage.getItem(STORAGE_KEY) === 'en' ? 'en' : 'hi' } catch { return 'hi' } }
const subscribe = (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb) } }
/** Hindi until the phone says otherwise; the server render and the first client render agree on 'hi'. */
const getServerSnapshot = (): Lang => 'hi'

export function setLanguage(lang: Lang) {
  try { localStorage.setItem(STORAGE_KEY, lang) } catch { /* private mode: the choice lives for this page only */ }
  for (const l of listeners) l()
}

const Ctx = createContext<{ lang: Lang; setLang: (l: Lang) => void }>({ lang: 'hi', setLang: () => {} })

export function LanguageProvider({ children }: { children: ReactNode }) {
  const lang = useSyncExternalStore(subscribe, read, getServerSnapshot)
  const setLang = useCallback((l: Lang) => setLanguage(l), [])
  return <Ctx.Provider value={{ lang, setLang }}>{children}</Ctx.Provider>
}
export const useLang = () => useContext(Ctx)
