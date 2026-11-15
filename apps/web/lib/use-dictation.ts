'use client'
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'

export const appendTranscript = (current: string, transcript: string): string =>
  [current.trim(), transcript.trim()].filter(Boolean).join(' ')

type Recognition = {
  lang: string
  interimResults: boolean
  continuous: boolean
  start(): void
  stop(): void
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null
  onend: (() => void) | null
  onerror: (() => void) | null
}
type Ctor = new () => Recognition
const ctor = (): Ctor | null =>
  typeof window === 'undefined'
    ? null
    : ((window as unknown as { SpeechRecognition?: Ctor; webkitSpeechRecognition?: Ctor }).SpeechRecognition ??
      (window as unknown as { webkitSpeechRecognition?: Ctor }).webkitSpeechRecognition ??
      null)

/** Speech to text through the browser's recogniser. `supported` is false where the API is missing; final phrases arrive through `onFinal`. */
export function useDictation(lang: 'en' | 'hi', onFinal: (text: string) => void) {
  // The browser capability does not change after mount, but the SSR render
  // has no `window` at all — a lazy `useState` initializer would read `false`
  // on the server and `true` on the client's first render, and React flags
  // that mismatch as a hydration error. useSyncExternalStore's server/client
  // snapshot split is built for exactly this: the server snapshot always
  // returns false, and the client snapshot only takes effect once React has
  // hydrated and re-rendered, so the first client render matches the server
  // and the mic button appears a beat later rather than causing a mismatch.
  const supported = useSyncExternalStore(
    () => () => {},
    () => ctor() !== null,
    () => false,
  )
  const [listening, setListening] = useState(false)
  const rec = useRef<Recognition | null>(null)
  const cb = useRef(onFinal)
  useEffect(() => {
    cb.current = onFinal
  }, [onFinal])
  const stop = useCallback(() => {
    rec.current?.stop()
    rec.current = null
    setListening(false)
  }, [])
  const start = useCallback(() => {
    const C = ctor()
    if (!C) return
    const r = new C()
    r.lang = lang === 'hi' ? 'hi-IN' : 'en-IN'
    r.interimResults = true
    r.continuous = false
    r.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i]!
        if (res.isFinal) cb.current(res[0].transcript)
      }
    }
    r.onend = () => {
      rec.current = null
      setListening(false)
    }
    r.onerror = () => {
      rec.current = null
      setListening(false)
    }
    rec.current = r
    setListening(true)
    r.start()
  }, [lang])
  useEffect(
    () => () => {
      rec.current?.stop()
    },
    [],
  )
  return { supported, listening, start, stop }
}
