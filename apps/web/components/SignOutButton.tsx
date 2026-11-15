'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

/**
 * Sign out, as a POST.
 *
 * The old dev logout was a plain GET link, which is fine for dropping a cookie
 * and wrong now that this revokes a session row: a link can be prefetched or
 * followed by a scanner, and an operator does not want the browser signing them
 * out because it was warming a URL. It also cannot be a form nested in the
 * header's flex row without disturbing the baseline alignment, so it posts with
 * fetch and then navigates.
 */
export function SignOutButton() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  const signOut = async () => {
    if (busy) return
    setBusy(true)
    try {
      await fetch('/api/auth/signout', { method: 'POST' })
    } catch {
      // Even if the request failed, still leave for the sign-in screen: the
      // worst case is a live session revocable from another device, and
      // stranding the operator on a floor screen is worse.
    }
    // `refresh()` first drops the router cache holding server-rendered trees
    // built while this user was signed in — without it, going Back would show
    // their name and role on a screen they no longer have access to.
    router.refresh()
    router.push('/signin')
  }

  return (
    <button
      type="button"
      onClick={signOut}
      className="hf-ui whitespace-nowrap text-[11px] uppercase underline"
      style={{ color: 'var(--hf-muted)' }}
    >
      {busy ? 'Signing out…' : 'Sign out'}
    </button>
  )
}
