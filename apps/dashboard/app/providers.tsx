'use client'
import { NeonAuthUIProvider } from '@neondatabase/auth-ui'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { authClient } from '@/lib/auth-client'

/**
 * `emailOTP` defaults to false in the installed provider, so it is opted in
 * here and is the only door we open. Magic link is deliberately absent: the
 * plugin is disabled on the Neon Auth project, so its endpoint answers 404 and
 * offering the button only produced an error toast. Turn it on in the Neon
 * console first if it is ever wanted, then add `magicLink` back here. No
 * password field, no social provider, no self-service sign-up — the `users`
 * table decides who is on the team (see lib/auth.ts).
 *
 * The theme tokens come from app/globals.css, which imports
 * '@neondatabase/auth-ui/tailwind' so the forms inherit the brand palette.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  return (
    <NeonAuthUIProvider
      authClient={authClient}
      navigate={router.push}
      replace={router.replace}
      onSessionChange={() => router.refresh()}
      emailOTP
      credentials={false}
      signUp={false}
      redirectTo="/overview"
      Link={Link}
    >
      {children}
    </NeonAuthUIProvider>
  )
}
