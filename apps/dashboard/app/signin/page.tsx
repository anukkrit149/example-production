import Image from 'next/image'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { devAuthEnabled, getCurrentUser } from '@/lib/auth'
import { SignIn } from './SignIn'

// Never prerender: with Neon Auth configured this page reads the session cookie.
// At build time the env is empty, so a static render would look valid and then
// throw DYNAMIC_SERVER_USAGE on the first real request.
export const dynamic = 'force-dynamic'

export const metadata = { title: 'Sign in · Sample Factory Dashboard' }

/**
 * Outside the (dashboard) layout on purpose: that layout redirects here when
 * there is no user, so rendering inside it would loop.
 */
export default async function SignInPage() {
  if (await getCurrentUser()) redirect('/overview')
  const neonConfigured = Boolean(process.env.NEON_AUTH_BASE_URL)

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-8 px-5 py-10">
      <div className="grid justify-items-center gap-6">
        <Image src="/brand/hf-lockup-header-light.svg" alt="Sample Factory" width={180} height={22} priority className="h-[22px] w-[180px]" />
        <h1 className="hf-display text-center text-2xl">Dashboard sign in</h1>
      </div>

      {neonConfigured ? (
        <SignIn />
      ) : (
        <p className="text-center" style={{ color: 'var(--hf-muted)' }}>
          Sign-in is not configured on this machine.
        </p>
      )}

      {devAuthEnabled() && (
        <Link href="/dev-login" className="hf-ui text-center text-sm underline" style={{ color: 'var(--hf-muted)' }}>
          Development sign-in
        </Link>
      )}
    </main>
  )
}
