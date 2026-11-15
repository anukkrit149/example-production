'use client'

import { useEffect, useRef, useState } from 'react'
import { BrowserQRCodeReader, type IScannerControls } from '@zxing/browser'
import { normalizeQrToken } from '@hf/domain'
import { useT } from '@/lib/i18n/useT'

/**
 * The camera view, plus the manual escape hatch.
 *
 * Two things a bench needs that a plain decoder loop does not give you:
 * a 3 second debounce, because a code held in frame decodes many times a second
 * and would fire the same lookup over and over; and a typed-entry field, because
 * a label gets scuffed, greasy or torn and the operator still has to move the
 * piece. Camera permission needs a secure origin, so on a phone the dev server
 * must run over HTTPS — the error line below says so out loud.
 *
 * `onUnknown` exists because silence is the worst answer a camera can give. A
 * QR that is not a piece label used to decode, fail the token test and be
 * dropped without a trace, which on a bench is indistinguishable from a dead
 * camera — and the commonest thing an operator holds up by mistake is now their
 * own ID card. Handing the raw text up lets the screen say which mistake it was.
 */
export function QrScanner({
  onToken,
  onUnknown,
}: {
  onToken: (token: string) => void
  onUnknown?: (text: string) => void
}) {
  const { t } = useT()
  const videoRef = useRef<HTMLVideoElement>(null)
  const lastRef = useRef<{ token: string; at: number }>({ token: '', at: 0 })
  const onTokenRef = useRef(onToken)
  const onUnknownRef = useRef(onUnknown)
  const [manual, setManual] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  // The decoder is started once and lives for the life of the screen. Keeping
  // the callback in a ref means a re-rendered parent never tears down the
  // camera mid-scan, which on Android costs a visible second to restart.
  useEffect(() => {
    onTokenRef.current = onToken
    onUnknownRef.current = onUnknown
  }, [onToken, onUnknown])

  useEffect(() => {
    let controls: IScannerControls | undefined
    let cancelled = false
    const reader = new BrowserQRCodeReader()

    reader
      .decodeFromVideoDevice(undefined, videoRef.current!, (result) => {
        if (!result) return
        const text = result.getText()
        const token = normalizeQrToken(text)
        // The debounce is keyed on the raw text, not the token, so a code held
        // in frame that is NOT a piece is reported once rather than many times
        // a second.
        const seen = token ?? text
        const now = Date.now()
        if (lastRef.current.token === seen && now - lastRef.current.at < 3000) return
        lastRef.current = { token: seen, at: now }
        if (token) onTokenRef.current(token)
        else onUnknownRef.current?.(text)
      })
      .then((c) => {
        if (cancelled) c.stop()
        else {
          controls = c
          setReady(true)
        }
      })
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : String(e)
        setError(
          `Camera unavailable: ${msg}. Type the code below instead.`,
        )
      })

    return () => {
      cancelled = true
      controls?.stop()
    }
  }, [])

  const submitManual = (e: React.FormEvent) => {
    e.preventDefault()
    const t = normalizeQrToken(manual)
    if (t) {
      setError(null)
      setManual('')
      onTokenRef.current(t)
    } else {
      setError('Codes look like HF-P-XXXXXXXX')
    }
  }

  return (
    <div className="grid gap-3">
      <div
        className="relative aspect-square w-full overflow-hidden rounded-xl"
        style={{ background: 'var(--hf-ink)' }}
      >
        <video
          ref={videoRef}
          className="h-full w-full object-cover"
          muted
          playsInline
        />
        {/* A reticle: where to hold the label, visible against any frame. */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div
            className="h-3/5 w-3/5 rounded-lg border-2"
            style={{ borderColor: 'rgba(242,239,232,0.85)' }}
          />
        </div>
        {!ready && !error && (
          <p
            className="hf-label absolute inset-x-0 bottom-4 text-center text-xs"
            style={{ color: 'var(--hf-paper)' }}
          >
            Starting camera
          </p>
        )}
      </div>

      {error && (
        <p role="alert" className="text-base font-semibold" style={{ color: 'var(--hf-oxblood-deep)' }}>
          {error}
        </p>
      )}

      <form className="flex gap-2" onSubmit={submitManual}>
        <input
          value={manual}
          onChange={(e) => setManual(e.target.value)}
          placeholder={t('scan_manual')}
          aria-label={t('scan_manual')}
          className="min-h-14 flex-1 rounded-lg border-2 px-3 font-mono text-lg uppercase"
          style={{
            borderColor: 'var(--hf-line)',
            background: 'var(--hf-card)',
            color: 'var(--hf-ink)',
          }}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
        />
        <button
          type="submit"
          className="hf-ui min-h-14 rounded-lg px-6 text-base uppercase"
          style={{ background: 'var(--hf-oxblood-lit)', color: 'var(--hf-paper)' }}
        >
          {t('scan_go')}
        </button>
      </form>
    </div>
  )
}
