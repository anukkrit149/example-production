'use client'

import { useEffect, useState } from 'react'

type Worker = { id: string; name: string; type: string }

/** What the operator calls this kind of worker out loud, for the empty state. */
const TRADE: Record<string, string> = {
  cutter: 'cutters',
  paster: 'pasters',
  tailor: 'tailors',
  finisher: 'finishers',
}

/**
 * Who is taking the piece.
 *
 * A radio group, not a dropdown: on a phone a native select hides every option
 * behind a tap and a scroll, and this is the one field the whole handover
 * record hangs on. Rows are full width and 64 px tall so a thumb cannot land
 * between two names. The chosen row goes oxblood — the interface accent, never
 * a stage colour — so it is obvious across a lit room which name is armed.
 */
export function WorkerPicker({
  type,
  value,
  onChange,
}: {
  type: string
  value: string
  onChange: (id: string) => void
}) {
  /*
   * One piece of state, not three: a `type` that changes mid-screen must not
   * leave the previous trade's names on display while the new list loads, and
   * two separate setStates in the effect body would do exactly that (and cost a
   * cascading render besides). The loaded list carries the type it belongs to,
   * so anything that does not match the current prop still reads as loading.
   */
  const [loaded, setLoaded] = useState<
    { type: string; workers: Worker[] } | { type: string; workers: null }
  >({ type: '', workers: [] })

  useEffect(() => {
    let live = true
    fetch(`/api/workers?type=${encodeURIComponent(type)}`)
      .then((r) => {
        if (!r.ok) throw new Error('could not load workers')
        return r.json() as Promise<{ workers: Worker[] }>
      })
      .then((d) => {
        if (live) setLoaded({ type, workers: d.workers })
      })
      .catch(() => {
        if (live) setLoaded({ type, workers: null })
      })
    return () => {
      live = false
    }
  }, [type])

  const state = loaded.type !== type ? 'loading' : loaded.workers === null ? 'error' : 'ready'
  const workers = loaded.workers ?? []

  if (state === 'loading') {
    return (
      <p className="text-base" style={{ color: 'var(--hf-muted)' }}>
        Loading {TRADE[type] ?? type}…
      </p>
    )
  }

  if (state === 'error') {
    return (
      <p role="alert" className="text-base font-semibold" style={{ color: 'var(--hf-oxblood-deep)' }}>
        Could not load the worker list. Check the network and reload.
      </p>
    )
  }

  if (workers.length === 0) {
    return (
      <p className="text-base" style={{ color: 'var(--hf-muted)' }}>
        No active {TRADE[type] ?? type}. Ask a supervisor to add one.
      </p>
    )
  }

  return (
    <div role="radiogroup" aria-label={`Choose a ${type}`} className="grid gap-2">
      {workers.map((w) => {
        const on = value === w.id
        return (
          <button
            key={w.id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(w.id)}
            className="flex min-h-16 w-full items-center gap-3 rounded-lg border-2 px-4 text-left text-xl font-semibold"
            style={{
              borderColor: on ? 'var(--hf-oxblood-lit)' : 'var(--hf-line)',
              background: on ? 'var(--hf-oxblood-lit)' : 'var(--hf-card)',
              color: on ? 'var(--hf-paper)' : 'var(--hf-ink)',
            }}
          >
            <Tick on={on} />
            <span className="min-w-0 truncate">{w.name}</span>
          </button>
        )
      })}
    </div>
  )
}

function Tick({ on }: { on: boolean }) {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="shrink-0">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.8" opacity={on ? 1 : 0.35} />
      {on && <path d="m7.5 12.3 3 3 6-6.6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />}
    </svg>
  )
}
