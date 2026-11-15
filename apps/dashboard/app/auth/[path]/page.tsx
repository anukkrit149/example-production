import Image from 'next/image'
import { notFound, redirect } from 'next/navigation'
import { AuthView } from '@neondatabase/auth-ui'
import { authViewPaths } from '@neondatabase/auth-ui/server'
import { getCurrentUser } from '@/lib/auth'
import { Providers } from '../../providers'

// Reads the session cookie, so never prerender (see app/signin/page.tsx).
export const dynamic = 'force-dynamic'

export const metadata = { title: 'Sign in · Sample Factory Dashboard' }

/**
 * The steps of the sign-in flow that are not the first screen.
 *
 * `AuthView` navigates between its views by URL: sending an email code moves
 * the browser to /auth/email-otp, a magic link lands on /auth/callback,
 * sign-out goes through /auth/sign-out. Without this route every one of those
 * was a 404 page, so the first screen worked and nothing after it did. The
 * first screen itself stays at /signin, which is what the rest of the app
 * links to; the UI's own "sign-in" path just redirects there.
 */
export default async function AuthPathPage({ params }: { params: Promise<{ path: string }> }) {
  const { path } = await params
  if (!Object.values(authViewPaths).includes(path)) notFound()
  if (path === authViewPaths.SIGN_IN) redirect('/signin')

  if (!process.env.NEON_AUTH_BASE_URL) redirect('/signin')

  // Someone already signed in has no business on an OTP or magic-link screen;
  // sign-out and the callback must still render to finish what they started.
  const passThrough: string[] = [authViewPaths.SIGN_OUT, authViewPaths.CALLBACK]
  if (!passThrough.includes(path) && (await getCurrentUser())) redirect('/overview')

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-8 px-5 py-10">
      <div className="grid justify-items-center gap-6">
        <Image src="/brand/hf-lockup-header-light.svg" alt="Sample Factory" width={180} height={22} priority className="h-[22px] w-[180px]" />
        <h1 className="hf-display text-center text-2xl">Dashboard sign in</h1>
      </div>
      <Providers>
        <AuthView path={path} />
      </Providers>
    </main>
  )
}
