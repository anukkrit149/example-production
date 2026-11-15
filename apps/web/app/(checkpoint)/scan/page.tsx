'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useState, useSyncExternalStore } from 'react'
import { badgeTokenFrom } from '@hf/domain'
import { QrScanner } from '@/components/QrScanner'
import { useT } from '@/lib/i18n/useT'

const RECENT_KEY = 'hf.recent-tokens'
const EMPTY = '[]'

const readRecent = (): string[] => {
  try {
    const raw = sessionStorage.getItem(RECENT_KEY)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    return []
  }
}

/*
 * sessionStorage is an external store, not React state, so it is read through
 * useSyncExternalStore: correct on the server (no storage, empty list), correct
 * on hydration, and no cascading render on mount. The snapshot is the raw JSON
 * string because it has to be referentially stable between reads.
 */
let listeners: Array<() => void> = []
const notifyRecentChanged = () => listeners.forEach((l) => l())
const subscribeRecent = (l: () => void) => {
  listeners = [...listeners, l]
  return () => {
    listeners = listeners.filter((x) => x !== l)
  }
}
const recentSnapshot = () => {
  try {
    return sessionStorage.getItem(RECENT_KEY) ?? EMPTY
  } catch {
    return EMPTY
  }
}
const recentServerSnapshot = () => EMPTY

/**
 * The entry point of the whole app: point the camera at a label, land on the
 * piece. The recent list is the second most common move — an operator working a
 * bundle scans the same handful of pieces back and forth, and re-aiming the
 * camera each time costs seconds they do not have.
 */
export default function ScanPage() {
  const router = useRouter()
  const { t } = useT()
  const [status, setStatus] = useState<{ kind: 'busy' | 'error'; text: string } | null>(null)
  const recentJson = useSyncExternalStore(subscribeRecent, recentSnapshot, recentServerSnapshot)
  let recent: string[]
  try {
    recent = JSON.parse(recentJson) as string[]
  } catch {
    recent = []
  }

  const lookUp = useCallback(
    async (token: string) => {
      setStatus({ kind: 'busy', text: `Looking up ${token}…` })
      let res: Response
      try {
        res = await fetch(`/api/scan/${token}`)
      } catch {
        setStatus({ kind: 'error', text: t('network') })
        return
      }
      if (res.status === 404) {
        setStatus({ kind: 'error', text: t('scan_unknown') })
        return
      }
      if (!res.ok) {
        setStatus({
          kind: 'error',
          text: t('network'),
        })
        return
      }
      const view = (await res.json()) as { id: string }
      try {
        const next = [token, ...readRecent().filter((existing) => existing !== token)].slice(0, 5)
        sessionStorage.setItem(RECENT_KEY, JSON.stringify(next))
        notifyRecentChanged()
      } catch {
        // A private-mode phone with no session storage still scans fine.
      }
      router.push(`/pieces/${view.id}`)
    },
    [router, t],
  )

  /**
   * A QR that decoded but is not a piece.
   *
   * The one worth naming is an operator's own ID card: it is the other QR they
   * carry, it is the one they will hold up here by mistake, and "no piece has
   * this code" would send them looking for a fault in a label that is working
   * perfectly.
   */
  const reportUnknown = useCallback(
    (text: string) => {
      setStatus({ kind: 'error', text: badgeTokenFrom(text) ? t('scan_is_badge') : t('scan_unknown') })
    },
    [t],
  )

  return (
    <main className="grid gap-5 p-4">
      <h1 className="hf-display text-2xl">{t('scan_title')}</h1>

      <QrScanner onToken={lookUp} onUnknown={reportUnknown} />

      {status && (
        <p
          aria-live="polite"
          className="text-lg font-semibold"
          style={{
            color: status.kind === 'error' ? 'var(--hf-oxblood-deep)' : 'var(--hf-muted)',
          }}
        >
          {status.text}
        </p>
      )}

      {recent.length > 0 && (
        <section className="grid gap-2">
          <h2 className="hf-label text-[10px]" style={{ color: 'var(--hf-muted)' }}>
            Recent
          </h2>
          <ul className="grid gap-2">
            {recent.map((token) => (
              <li key={token}>
                <button
                  type="button"
                  onClick={() => lookUp(token)}
                  className="min-h-14 w-full rounded-lg border-2 px-4 text-left font-mono text-lg"
                  style={{
                    borderColor: 'var(--hf-line)',
                    background: 'var(--hf-card)',
                    color: 'var(--hf-ink)',
                  }}
                >
                  {token}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Link
        href="/pieces/new"
        className="hf-ui flex min-h-14 items-center justify-center rounded-lg border-2 px-4 text-base uppercase"
        style={{ borderColor: 'var(--hf-oxblood-lit)', color: 'var(--hf-oxblood-lit)' }}
      >
        New piece at cutting
      </Link>
    </main>
  )
}
