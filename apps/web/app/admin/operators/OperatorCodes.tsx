'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { badgeSignInUrl } from '@hf/domain'
import { BadgeCard } from '@/components/BadgeCard'

export type CredentialKind = 'code' | 'badge'

export type CodeRow = {
  id: string
  kind: CredentialKind
  last4: string
  issuedAt: string
  expiresAt: string | null
  revokedAt: string | null
  lastUsedAt: string | null
  /** Decided on the server. Comparing an expiry to `Date.now()` during render
   *  would make this component's output depend on when React happened to run. */
  expired: boolean
  user: { id: string; name: string; role: string; active: boolean }
  issuedBy: { id: string; name: string }
}

export type UserRow = { id: string; name: string; role: string }

type IssuedCard = { id: string; token: string; url: string; user: { name: string; role: string } }
type IssuedCode = { code: string; user: { name: string } }

const fmt = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

const KIND_LABEL: Record<CredentialKind, string> = { code: 'Typed code', badge: 'ID card' }

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many)

/**
 * Issuing and revoking the two ways onto the floor.
 *
 * ID card first, and selected by default, because it is now the normal one. The
 * typed code came first and still exists — a phone can always be signed in by
 * hand, and a supervisor sometimes has to — but it asks an operator to read
 * eight characters off a slip and type them, which is the step this floor
 * actually fails at. A card asks them to hold up a phone.
 *
 * Cards are issued for as many operators as are ticked, because the real job is
 * never one card: it is kitting out a shift. Codes stay one at a time, since
 * they are only ever issued to cover a specific person on a specific morning.
 *
 * Both flows are built around one hard fact: the secret is visible exactly
 * once. So both end in a panel that is impossible to miss and impossible to
 * dismiss by accident, and the card panel's exit is a deliberate "I have
 * printed them" rather than a stray tap anywhere else on the page.
 */
export function OperatorCodes({
  users,
  codes,
  badgeOrigin,
}: {
  users: UserRow[]
  codes: CodeRow[]
  badgeOrigin: string
}) {
  const router = useRouter()
  const [kind, setKind] = useState<CredentialKind>('badge')
  const [picked, setPicked] = useState<string[]>([])
  const [userId, setUserId] = useState('')
  const [days, setDays] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cards, setCards] = useState<IssuedCard[] | null>(null)
  const [issuedCode, setIssuedCode] = useState<IssuedCode | null>(null)

  // Who already carries a live card. The "everyone without one" shortcut is
  // what makes kitting out a floor of fifty a single decision rather than fifty.
  const hasLiveCard = new Set(
    codes.filter((c) => c.kind === 'badge' && !c.revokedAt && !c.expired).map((c) => c.user.id),
  )
  const withoutCard = users.filter((u) => !hasLiveCard.has(u.id))

  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))

  const post = async (body: Record<string, unknown>) => {
    const res = await fetch('/api/admin/operator-codes', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...body, ...(days ? { expiresInDays: Number(days) } : {}) }),
    })
    const parsed = await res.json()
    if (!res.ok) throw new Error(parsed.error?.message ?? 'Could not issue that.')
    return parsed
  }

  /**
   * Issue one card per ticked operator, one request at a time.
   *
   * Sequential and not a single batch request on purpose. Each card is an
   * unrecoverable secret the moment it is created, so what matters when the
   * network drops halfway is knowing exactly which ones exist: this way the
   * cards already issued are on screen to be printed and the rest simply were
   * not created, and the error names where it stopped. A batch endpoint would
   * either roll the lot back or leave the same partial state without being able
   * to say which half.
   */
  const issueCards = async () => {
    if (!picked.length || busy) return
    setError(null)
    const issued: IssuedCard[] = []
    try {
      for (const [i, id] of picked.entries()) {
        setBusy(`Issuing ${i + 1} of ${picked.length}…`)
        const body = await post({ userId: id, kind: 'badge' })
        issued.push({
          id: body.id,
          token: body.code,
          url: badgeSignInUrl(badgeOrigin, body.code),
          user: body.user,
        })
      }
    } catch (e) {
      setError(
        `${e instanceof Error ? e.message : 'No connection.'} ${issued.length} ${plural(issued.length, 'card was', 'cards were')} issued before this — print ${plural(issued.length, 'it', 'them')} below, then try the rest again.`,
      )
    } finally {
      setBusy(null)
    }

    if (issued.length) {
      setCards(issued)
      setPicked([])
      setDays('')
      router.refresh()
    }
  }

  const issueCode = async () => {
    if (!userId || busy) return
    setError(null)
    setBusy('Issuing…')
    try {
      const body = await post({ userId, kind: 'code' })
      setIssuedCode({ code: body.code, user: body.user })
      setUserId('')
      setDays('')
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No connection. Try again.')
    } finally {
      setBusy(null)
    }
  }

  const revoke = async (id: string) => {
    setError(null)
    try {
      const res = await fetch(`/api/admin/operator-codes/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json()
        setError(body.error?.message ?? 'Could not revoke.')
        return
      }
      router.refresh()
    } catch {
      setError('No connection. Try again.')
    }
  }

  // The one-time reveal takes over the screen. Nothing else is worth looking at
  // while unrecoverable secrets are on it.
  if (cards) {
    return (
      <div className="grid gap-5">
        <h2 className="hf-display hf-no-print text-2xl">
          {cards.length} ID {plural(cards.length, 'card', 'cards')}
        </h2>

        {error && (
          <p role="alert" className="hf-no-print text-base font-semibold" style={{ color: 'var(--hf-stage-pasting)' }}>
            {error}
          </p>
        )}

        {/*
          The sheet is what print keeps; everything around it is hidden (see
          globals.css). Cards flow across the page at true size and never break
          across a page boundary, so this prints as a sheet to be guillotined.
        */}
        <div className="hf-print-sheet flex flex-wrap justify-center gap-4">
          {cards.map((c) => (
            <BadgeCard key={c.id} name={c.user.name} role={c.user.role} url={c.url} token={c.token} />
          ))}
        </div>

        <section
          className="hf-no-print grid gap-2 rounded-xl border-2 p-5"
          style={{ borderColor: 'var(--hf-oxblood-lit)', background: 'var(--hf-card)' }}
        >
          <p className="hf-label text-[10px]" style={{ color: 'var(--hf-muted)' }}>
            Print {plural(cards.length, 'it', 'them')} now
          </p>
          <p className="text-base font-semibold" style={{ color: 'var(--hf-oxblood-deep)' }}>
            {plural(cards.length, 'This card', 'These cards')} cannot be printed again. They are
            stored only as a hash — nobody, including an administrator, can recover one later. If a
            card is lost, revoke it and issue a new one.
          </p>
          {/*
            The address in plain sight, because a card printed against the wrong
            origin looks perfect and scans to nothing. An admin can read this
            line and know before printing fifty of them.
          */}
          <p className="break-all font-mono text-sm" style={{ color: 'var(--hf-muted)' }}>
            Every card points at {badgeOrigin}
          </p>
        </section>

        <button
          type="button"
          onClick={() => window.print()}
          className="hf-ui hf-no-print flex w-full items-center justify-center rounded-xl border-2 px-4 uppercase"
          style={{
            minHeight: '60px',
            background: 'var(--hf-oxblood-lit)',
            borderColor: 'var(--hf-oxblood-lit)',
            color: 'var(--hf-paper)',
          }}
        >
          Print {cards.length === 1 ? 'card' : `${cards.length} cards`}
        </button>

        <button
          type="button"
          onClick={() => {
            setCards(null)
            setError(null)
          }}
          className="hf-ui hf-no-print flex w-full items-center justify-center rounded-xl border-2 px-4 uppercase"
          style={{
            minHeight: '60px',
            background: 'var(--hf-paper)',
            borderColor: 'var(--hf-line)',
            color: 'var(--hf-ink)',
          }}
        >
          I have printed {plural(cards.length, 'it', 'them')}
        </button>
      </div>
    )
  }

  if (issuedCode) {
    return (
      <div className="grid gap-5">
        <h2 className="hf-display text-2xl">Code for {issuedCode.user.name}</h2>

        <section
          className="grid gap-3 rounded-xl border-2 p-5"
          style={{ borderColor: 'var(--hf-oxblood-lit)', background: 'var(--hf-card)' }}
        >
          <p className="hf-label text-[10px]" style={{ color: 'var(--hf-muted)' }}>
            Write this down now
          </p>
          <p
            className="text-center font-mono font-semibold"
            style={{ fontSize: '38px', letterSpacing: '0.08em', color: 'var(--hf-ink)' }}
          >
            {issuedCode.code}
          </p>
          <p className="text-base font-semibold" style={{ color: 'var(--hf-oxblood-deep)' }}>
            This code will not be shown again. It is stored only as a hash — nobody, including an
            administrator, can look it up later. If it is lost, revoke it and issue a new one.
          </p>
        </section>

        <button
          type="button"
          onClick={() => setIssuedCode(null)}
          className="hf-ui flex w-full items-center justify-center rounded-xl border-2 px-4 uppercase"
          style={{
            minHeight: '60px',
            background: 'var(--hf-oxblood-lit)',
            borderColor: 'var(--hf-oxblood-lit)',
            color: 'var(--hf-paper)',
          }}
        >
          I have written it down
        </button>
      </div>
    )
  }

  return (
    <div className="grid gap-7">
      <section className="grid gap-3">
        <h2 className="hf-label text-[10px]" style={{ color: 'var(--hf-muted)' }}>
          Issue
        </h2>

        {/*
          Two buttons rather than a dropdown: the choice changes what comes out
          of this screen — cards to print or a code to write down — and it is
          worth a tap, not a hidden default.
        */}
        <div role="radiogroup" aria-label="What to issue" className="grid grid-cols-2 gap-2">
          {(['badge', 'code'] as const).map((k) => {
            const on = kind === k
            return (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => {
                  setKind(k)
                  setError(null)
                }}
                className="hf-ui flex items-center justify-center rounded-lg border-2 px-3 text-center text-sm uppercase"
                style={{
                  minHeight: '56px',
                  borderColor: on ? 'var(--hf-oxblood-lit)' : 'var(--hf-line)',
                  background: on ? 'var(--hf-oxblood-lit)' : 'var(--hf-card)',
                  color: on ? 'var(--hf-paper)' : 'var(--hf-ink)',
                }}
              >
                {KIND_LABEL[k]}
              </button>
            )
          })}
        </div>

        <p className="text-base" style={{ color: 'var(--hf-muted)' }}>
          {kind === 'badge'
            ? 'A QR printed on the operator’s ID card. They point the phone camera at it and are signed in — nothing to type.'
            : 'Eight characters on a slip, typed once on the phone. For supervisors, and for a phone with no working camera.'}
        </p>

        {kind === 'badge' ? (
          <>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setPicked(withoutCard.map((u) => u.id))}
                disabled={withoutCard.length === 0}
                className="hf-ui flex min-h-14 flex-1 items-center justify-center rounded-lg border-2 px-3 text-sm uppercase disabled:opacity-40"
                style={{ borderColor: 'var(--hf-line)', background: 'var(--hf-card)', color: 'var(--hf-ink)' }}
              >
                Everyone without a card ({withoutCard.length})
              </button>
              <button
                type="button"
                onClick={() => setPicked([])}
                disabled={picked.length === 0}
                className="hf-ui flex min-h-14 items-center justify-center rounded-lg border-2 px-4 text-sm uppercase disabled:opacity-40"
                style={{ borderColor: 'var(--hf-line)', background: 'var(--hf-card)', color: 'var(--hf-ink)' }}
              >
                Clear
              </button>
            </div>

            <ul className="grid gap-2">
              {users.map((u) => {
                const on = picked.includes(u.id)
                return (
                  <li key={u.id}>
                    <label
                      className="flex min-h-14 cursor-pointer items-center gap-3 rounded-lg border-2 px-3"
                      style={{
                        borderColor: on ? 'var(--hf-oxblood-lit)' : 'var(--hf-line)',
                        background: 'var(--hf-card)',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => toggle(u.id)}
                        className="h-6 w-6 flex-none"
                        style={{ accentColor: 'var(--hf-oxblood-lit)' }}
                      />
                      <span className="min-w-0 flex-1 truncate text-lg" style={{ color: 'var(--hf-ink)' }}>
                        {u.name} · {u.role}
                      </span>
                      {/*
                        Whether this person can already get onto the floor.
                        Issuing a second card is legal and sometimes right, but
                        it should be a decision rather than an accident.
                      */}
                      {hasLiveCard.has(u.id) && (
                        <span className="hf-label flex-none text-[10px]" style={{ color: 'var(--hf-muted)' }}>
                          Has card
                        </span>
                      )}
                    </label>
                  </li>
                )
              })}
            </ul>
          </>
        ) : (
          <select
            aria-label="Operator"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className="w-full rounded-lg border-2 px-3 text-lg"
            style={{
              minHeight: '56px',
              borderColor: 'var(--hf-line)',
              background: 'var(--hf-card)',
              color: 'var(--hf-ink)',
            }}
          >
            <option value="">Choose an operator</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} · {u.role}
              </option>
            ))}
          </select>
        )}

        <input
          aria-label="Expires in days (optional)"
          value={days}
          onChange={(e) => setDays(e.target.value.replace(/[^0-9]/g, '').slice(0, 3))}
          inputMode="numeric"
          placeholder="Expires in days (optional)"
          className="w-full rounded-lg border-2 px-3 text-lg"
          style={{
            minHeight: '56px',
            borderColor: 'var(--hf-line)',
            background: 'var(--hf-card)',
            color: 'var(--hf-ink)',
          }}
        />

        <button
          type="button"
          onClick={kind === 'badge' ? issueCards : issueCode}
          disabled={!!busy || (kind === 'badge' ? picked.length === 0 : !userId)}
          className="hf-ui flex w-full items-center justify-center rounded-xl border-2 px-4 uppercase disabled:opacity-40"
          style={{
            minHeight: '60px',
            background: 'var(--hf-oxblood-lit)',
            borderColor: 'var(--hf-oxblood-lit)',
            color: 'var(--hf-paper)',
          }}
        >
          {busy ??
            (kind === 'badge'
              ? `Issue ${picked.length || ''} ID ${plural(picked.length, 'card', 'cards')}`.replace('  ', ' ')
              : 'Issue a code')}
        </button>

        {error && (
          <p role="alert" className="text-base font-semibold" style={{ color: 'var(--hf-stage-pasting)' }}>
            {error}
          </p>
        )}
      </section>

      <section className="grid gap-3">
        <h2 className="hf-label text-[10px]" style={{ color: 'var(--hf-muted)' }}>
          Issued
        </h2>

        {codes.length === 0 && (
          <p className="text-base" style={{ color: 'var(--hf-muted)' }}>
            Nothing issued yet.
          </p>
        )}

        <ul className="grid gap-3">
          {codes.map((c) => {
            const dead = !!c.revokedAt || c.expired
            return (
              <li
                key={c.id}
                className="grid gap-2 rounded-xl border-2 p-4"
                style={{
                  borderColor: dead ? 'var(--hf-line)' : 'var(--hf-oxblood-lit)',
                  background: 'var(--hf-card)',
                  opacity: dead ? 0.6 : 1,
                }}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="hf-ui text-base uppercase" style={{ color: 'var(--hf-ink)' }}>
                    {c.user.name}
                  </span>
                  <span className="font-mono text-lg" style={{ color: 'var(--hf-ink)' }}>
                    ····{c.last4}
                  </span>
                </div>

                {/*
                  Which kind, on its own line. An operator can hold both — a card
                  for every day and a code for the morning they left it at home —
                  and "revoke the card, keep the code" needs the two to be
                  distinguishable at a glance.
                */}
                <p className="hf-label text-[10px]" style={{ color: 'var(--hf-muted)' }}>
                  {KIND_LABEL[c.kind]}
                </p>

                <p className="text-base" style={{ color: 'var(--hf-muted)' }}>
                  {c.user.role} · issued {fmt(c.issuedAt)} by {c.issuedBy.name}
                </p>
                <p className="text-base" style={{ color: 'var(--hf-muted)' }}>
                  Last used {fmt(c.lastUsedAt)}
                  {c.expiresAt ? ` · expires ${fmt(c.expiresAt)}` : ''}
                </p>

                {c.revokedAt ? (
                  <p className="hf-label text-[10px]" style={{ color: 'var(--hf-stage-pasting)' }}>
                    Revoked {fmt(c.revokedAt)}
                  </p>
                ) : c.expired ? (
                  <p className="hf-label text-[10px]" style={{ color: 'var(--hf-muted)' }}>
                    Expired
                  </p>
                ) : (
                  <button
                    type="button"
                    onClick={() => revoke(c.id)}
                    className="hf-ui flex w-full items-center justify-center rounded-lg border-2 px-4 uppercase"
                    style={{
                      minHeight: '56px',
                      borderColor: 'var(--hf-stage-pasting)',
                      background: 'var(--hf-paper)',
                      color: 'var(--hf-stage-pasting)',
                    }}
                  >
                    Revoke
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}
