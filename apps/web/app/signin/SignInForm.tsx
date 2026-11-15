'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

type Err = { error: { code: string; message: string } }

/**
 * The floor sign-in.
 *
 * One field, one button, nothing else. The operator doing this is standing at a
 * bench with a slip of paper in one gloved hand and a shared phone in the
 * other; anything more than "type the code, press the button" is a thing that
 * can go wrong at 7am.
 *
 * Everything here is oversized on purpose: 72px on the input and the submit
 * against a 56px floor, because gloves and a small target do not mix, and the
 * code itself is set in a large tracked monospace so a mistyped character is
 * visible before submitting rather than after.
 */
export function SignInForm() {
  const router = useRouter()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lockedOut, setLockedOut] = useState(false)
  const [failures, setFailures] = useState(0)

  /**
   * Display formatting, applied as they type.
   *
   * Strip to the alphabet, uppercase, then re-group as XXXX-XXXX. The operator
   * reads the code off a slip printed with the dash, so the field has to look
   * like the slip. The server normalises again anyway — this is purely so the
   * two things match on screen.
   */
  const onChange = (raw: string) => {
    const clean = raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8)
    setCode(clean.length > 4 ? `${clean.slice(0, 4)}-${clean.slice(4)}` : clean)
    if (error) setError(null)
  }

  const digits = code.replace(/[^A-Z0-9]/g, '')
  const canSubmit = digits.length === 8 && !busy && !lockedOut

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/auth/code', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code }),
      })

      if (res.ok) {
        // `refresh()` before `push()` is the important half: the checkpoint
        // layout resolves the user on the server, and the client router would
        // otherwise serve a cached tree rendered when nobody was signed in —
        // which redirects straight back here.
        //
        // `busy` is deliberately left set. The button stays in its "signing in"
        // state until the new screen paints, rather than flicking back to
        // "Sign in" and inviting a second tap on a phone that is already on its
        // way to Home.
        router.refresh()
        router.push('/home')
        return
      }

      const body = (await res.json()) as Err
      if (res.status === 429) {
        setLockedOut(true)
        setError(body.error.message)
      } else {
        setFailures((n) => n + 1)
        setError(body.error.message)
      }
      setBusy(false)
    } catch {
      setError('No connection. Check the network and try again.')
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-6">
      <div className="grid gap-3">
        <label htmlFor="operator-code" className="hf-label text-[11px]" style={{ color: 'var(--hf-muted)' }}>
          Your code
        </label>
        <input
          id="operator-code"
          value={code}
          onChange={(e) => onChange(e.target.value)}
          disabled={lockedOut}
          autoCapitalize="characters"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          inputMode="text"
          autoFocus
          placeholder="XXXX-XXXX"
          aria-describedby="code-help"
          className="w-full rounded-xl border-2 text-center font-mono disabled:opacity-50"
          style={{
            minHeight: '72px',
            fontSize: '30px',
            letterSpacing: '0.12em',
            borderColor: error ? 'var(--hf-stage-pasting)' : 'var(--hf-line)',
            background: 'var(--hf-card)',
            color: 'var(--hf-ink)',
          }}
        />
        <p id="code-help" className="text-base" style={{ color: 'var(--hf-muted)' }}>
          Eight characters, from the slip your supervisor gave you.
        </p>
      </div>

      <button
        type="submit"
        disabled={!canSubmit}
        className="hf-ui flex w-full items-center justify-center rounded-xl border-2 px-4 uppercase disabled:opacity-40"
        style={{
          minHeight: '64px',
          fontSize: '17px',
          background: 'var(--hf-oxblood-lit)',
          borderColor: 'var(--hf-oxblood-lit)',
          color: 'var(--hf-paper)',
        }}
      >
        {busy ? 'Signing in…' : 'Sign in'}
      </button>

      {error && (
        <div
          role="alert"
          className="rounded-xl border-2 p-4"
          style={{
            borderColor: 'var(--hf-stage-pasting)',
            background: 'var(--hf-card)',
          }}
        >
          <p className="text-lg font-semibold" style={{ color: 'var(--hf-stage-pasting)' }}>
            {lockedOut ? 'Locked out' : 'That code did not work'}
          </p>
          <p className="mt-1 text-base" style={{ color: 'var(--hf-ink)' }}>
            {error}
          </p>
          {/*
            The count is shown because silence is worse: an operator who does not
            know they are two tries from a lockout will burn the last two.
          */}
          {!lockedOut && failures > 0 && (
            <p className="mt-2 text-base" style={{ color: 'var(--hf-muted)' }}>
              {failures === 1 ? '1 wrong try' : `${failures} wrong tries`}. After 5, sign-in locks for 15 minutes.
            </p>
          )}
        </div>
      )}
    </form>
  )
}
