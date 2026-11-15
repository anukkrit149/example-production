'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { badgeTokenFrom } from '@hf/domain'

type State =
  | { kind: 'working' }
  | { kind: 'done'; name: string }
  | { kind: 'failed'; message: string }

/** The card did not work, or there was no card in the link at all. */
const NO_TOKEN = 'This link is incomplete. Scan the QR on the card again.'

/**
 * What a worker sees between holding up their card and being on the floor.
 *
 * The token comes out of `location.hash`, never out of the path or a prop: a
 * fragment is not sent to the server, so the card's secret exists only in this
 * browser. It is cleared out of the address bar as soon as it has been read,
 * before the post is even made, so a phone left on this screen is not showing
 * anybody's credential.
 *
 * The sign-in fires on mount, with no tap: a camera app has already opened this
 * URL, and asking someone who cannot type an eight-character code to now find
 * and press a button would put back the step the card exists to remove. What
 * keeps another site from driving that same POST is the origin check on the
 * route, not a gesture here.
 *
 * Both languages are on screen at once, Hindi first, rather than behind the
 * हिं | EN slider the checkpoint screens use. That slider lives on
 * `LanguageProvider`, which lives inside the signed-in layout, and this screen
 * is by definition outside it — and a worker who has not signed in yet has no
 * remembered choice to honour anyway.
 */
export function BadgeSignIn() {
  const router = useRouter()
  const [state, setState] = useState<State>({ kind: 'working' })
  // Held so the retry button has something to retry. It is read out of the
  // fragment once, on mount, and the fragment is gone immediately afterwards.
  const [token, setToken] = useState<string | null>(null)
  // React runs effects twice in development, and the first run clears the hash
  // the second would read. Both are reasons this must happen exactly once.
  const started = useRef(false)

  const signIn = useCallback(async (token: string) => {
    setState({ kind: 'working' })
    let res: Response
    try {
      res = await fetch('/api/auth/badge', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token }),
      })
    } catch {
      setState({ kind: 'failed', message: 'No connection. नेटवर्क नहीं।' })
      return
    }

    if (res.ok) {
      const body = (await res.json()) as { user: { name: string } }
      setState({ kind: 'done', name: body.user.name })
      // `refresh()` before the navigation: the signed-in layout resolves the
      // user on the server, and the client router would otherwise serve a tree
      // rendered when nobody was signed in — which bounces straight back out.
      router.refresh()
      // `replace`, not `push`, so Back does not return to this screen and try to
      // sign in again with a hash that is no longer there.
      router.replace('/home')
      return
    }

    const body = (await res.json().catch(() => null)) as
      | { error?: { message?: string } }
      | null
    setState({
      kind: 'failed',
      message: body?.error?.message ?? 'This card did not work.',
    })
  }, [router])

  /**
   * Read the card out of the fragment, clear it, and use it.
   *
   * All of it inside one async step rather than in the effect body: the token
   * has to be read on the client (a fragment does not exist during the server
   * render, so it cannot come from a lazy initial state either), and everything
   * that follows from reading it belongs with it.
   */
  const begin = useCallback(async () => {
    const scanned = badgeTokenFrom(window.location.hash.slice(1))
    if (!scanned) {
      setState({ kind: 'failed', message: NO_TOKEN })
      return
    }
    setToken(scanned)

    // Out of the address bar and out of the history entry before the post is
    // even made. `replaceState` rather than assigning `location.hash`, which
    // would push a new entry and leave the old one still holding the token.
    try {
      window.history.replaceState(null, '', window.location.pathname)
    } catch {
      // A browser that refuses this still signs in; the URL just stays put.
    }

    await signIn(scanned)
  }, [signIn])

  useEffect(() => {
    if (started.current) return
    started.current = true
    void begin()
  }, [begin])

  if (state.kind === 'failed') {
    return (
      <div className="grid gap-6">
        <div
          role="alert"
          className="grid gap-2 rounded-xl border-2 p-5"
          style={{ borderColor: 'var(--hf-stage-pasting)', background: 'var(--hf-card)' }}
        >
          <p className="text-2xl font-semibold" style={{ color: 'var(--hf-stage-pasting)' }}>
            कार्ड नहीं चला
          </p>
          <p className="text-lg" style={{ color: 'var(--hf-ink)' }}>
            {state.message}
          </p>
          <p className="text-lg" style={{ color: 'var(--hf-muted)' }}>
            सुपरवाइज़र से नया कार्ड लें।
          </p>
        </div>

        {/*
          Only offered when there is something to retry. With no token in the
          link, tapping this would fail identically every time — the fix is to
          scan the card again, which the message above asks for.
        */}
        {token && (
          <button
            type="button"
            onClick={() => void signIn(token)}
            className="hf-ui flex w-full items-center justify-center rounded-xl border-2 px-4 uppercase"
            style={{
              minHeight: '64px',
              fontSize: '17px',
              background: 'var(--hf-oxblood-lit)',
              borderColor: 'var(--hf-oxblood-lit)',
              color: 'var(--hf-paper)',
            }}
          >
            फिर कोशिश करें · Try again
          </button>
        )}

        <Link
          href="/signin"
          className="hf-ui text-center text-base underline"
          style={{ color: 'var(--hf-muted)' }}
        >
          कोड टाइप करें · Type a code instead
        </Link>
      </div>
    )
  }

  return (
    <div className="grid gap-6">
      <p aria-live="polite" className="text-center text-2xl" style={{ color: 'var(--hf-ink)' }}>
        {state.kind === 'done' ? `नमस्ते, ${state.name}` : 'साइन इन हो रहा है…'}
      </p>
      <p className="text-center text-lg" style={{ color: 'var(--hf-muted)' }}>
        {state.kind === 'done' ? 'Signed in. Opening the floor…' : 'Signing you in…'}
      </p>

      {/*
        A phone whose script never ran cannot sign in from a card at all — the
        token is in the fragment and only script can read it — so the only
        honest fallback is the code screen.
      */}
      <noscript>
        <p className="text-center text-lg" style={{ color: 'var(--hf-muted)' }}>
          <Link href="/signin" className="underline">
            कोड टाइप करें · Type a code instead
          </Link>
        </p>
      </noscript>
    </div>
  )
}
