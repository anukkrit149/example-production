import Image from 'next/image'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { devAuthEnabled, getCurrentUser } from '@/lib/auth'
import { SignInForm } from './SignInForm'

export const metadata = { title: 'Sign in · Sample Factory' }

/**
 * The way onto the floor.
 *
 * Deliberately outside the (checkpoint) layout: that layout redirects here when
 * there is no user, so rendering inside it would loop. It carries its own
 * lockup instead, on paper, at the kit's minimum width.
 *
 * An operator who is already signed in never sees this — they get bounced
 * straight to Home.
 */
export default async function SignIn() {
  if (await getCurrentUser()) redirect('/home')

  return (
    <main
      className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-8 px-5 py-10"
      style={{ background: 'var(--hf-paper)' }}
    >
      <div className="grid justify-items-center gap-6">
        <Image
          src="/brand/hf-lockup-header-light.svg"
          alt="Sample Factory"
          width={180}
          height={22}
          priority
          className="h-[22px] w-[180px]"
        />
        <h1 className="hf-display text-center text-2xl" style={{ color: 'var(--hf-ink)' }}>
          Sign in
        </h1>
      </div>

      <SignInForm />

      {/*
        Most operators should never get this far. They scanned the poster QR,
        which lands here, when the one on their ID card would have signed them
        in outright — so the first thing under the form is the way out of it,
        in the language of the person who cannot use the field above.
      */}
      <div
        className="grid gap-1 rounded-xl border-2 p-4 text-center"
        style={{ borderColor: 'var(--hf-line)', background: 'var(--hf-card)' }}
      >
        <p className="text-lg font-semibold" style={{ color: 'var(--hf-ink)' }}>
          ID कार्ड है? फ़ोन का कैमरा उसके QR पर रखें
        </p>
        <p className="text-base" style={{ color: 'var(--hf-muted)' }}>
          Have an ID card? Point the phone camera at the QR on it and you are signed in — there is
          nothing to type here.
        </p>
      </div>

      <p className="text-center text-base" style={{ color: 'var(--hf-muted)' }}>
        No card or code, or lost yours? Ask your supervisor to issue a new one.
      </p>

      {/*
        Only rendered when the dev flag is on, so production never shows a door
        that does not exist. The picker itself refuses to render without it too.
      */}
      {devAuthEnabled() && (
        <Link
          href="/dev-login"
          className="hf-ui text-center text-sm underline"
          style={{ color: 'var(--hf-muted)' }}
        >
          Development sign-in
        </Link>
      )}
    </main>
  )
}
