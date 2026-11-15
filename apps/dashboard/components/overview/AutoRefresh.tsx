'use client'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

/**
 * Anything a reader is in the middle of using. A `router.refresh()` re-renders
 * the whole tree, which closes an open menu and throws away half-typed input —
 * the bug that made the old date picker impossible to use. Radix stamps
 * `data-state="open"` on its own layers, so one query covers every popover,
 * select menu and dialog on the page; focus inside `main` covers the rest.
 */
const BUSY = '[data-slot="popover-content"][data-state="open"], [data-slot="select-content"][data-state="open"], [role="dialog"][data-state="open"]'

const busy = () => {
  if (document.querySelector(BUSY)) return true
  const el = document.activeElement
  return !!el?.closest('main') && ['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName)
}

/**
 * Keeps the pulse honest without a poll loop against a JSON route: the page is
 * a server component, so asking Next for a fresh render is the whole update.
 *
 * The interval only runs while the tab is visible. A screen left open on a
 * supervisor's second monitor overnight would otherwise re-render the entire
 * overview — every aggregate query behind it — twice a minute for no reader.
 *
 * A tick lands on a busy screen often enough to matter: 30 seconds is less time
 * than it takes to find a date three months back. Such a tick is skipped, not
 * deferred — the next one is only 30 seconds away, and the numbers being one
 * cycle stale is invisible next to a menu closing under the reader's cursor.
 */
export function AutoRefresh({ seconds = 30, asOf }: { seconds?: number; asOf: string }) {
  const router = useRouter()
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined
    const stop = () => {
      if (timer) clearInterval(timer)
      timer = undefined
    }
    const start = () => {
      stop()
      timer = setInterval(() => {
        if (!busy()) router.refresh()
      }, seconds * 1000)
    }
    const onVis = () => (document.visibilityState === 'visible' ? start() : stop())
    onVis()
    document.addEventListener('visibilitychange', onVis)
    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [router, seconds])
  return (
    <span className="text-xs" style={{ color: 'var(--hf-muted)' }}>
      as of {asOf} · refreshes every {seconds} s
    </span>
  )
}
