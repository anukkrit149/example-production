'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { authClient } from '@/lib/auth-client'

/**
 * `neon` says whether this session came through Neon Auth. The dev cookie is
 * always cleared; the Neon call is made only when there is a Neon session to
 * end, because on a machine with dev auth and no Neon secret the Neon route
 * throws, and a 500 on every sign-out is noise that hides real errors.
 */
export function SignOutButton({ neon }: { neon: boolean }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const signOut = async () => {
    setBusy(true)
    await Promise.allSettled([...(neon ? [authClient.signOut()] : []), fetch('/api/dev-logout', { method: 'POST' })])
    router.push('/signin')
    router.refresh()
  }
  return (
    <button type="button" onClick={signOut} disabled={busy} className="hf-ui text-[11px] uppercase underline" style={{ color: 'var(--hf-muted)' }}>
      Sign out
    </button>
  )
}
