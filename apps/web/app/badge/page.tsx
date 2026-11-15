import Image from 'next/image'
import { BadgeSignIn } from './BadgeSignIn'

export const metadata = {
  title: 'Sign in · Sample Factory',
  // Nothing here should be indexed or linked out of. The card is a credential
  // and this is the screen it lands on; neither wants an audience.
  robots: { index: false, follow: false },
  referrer: 'no-referrer' as const,
}

/**
 * Where an ID card lands.
 *
 * The token is NOT in this URL's path — it rides in the fragment, which no
 * browser ever sends to a server. So this page never receives it, never renders
 * it, and it appears in no access log between the phone and here. The client
 * component reads it out of `location.hash`, posts it, and clears it.
 *
 * Deliberately outside the (checkpoint) layout — that layout redirects anyone
 * without a session to /signin, and this screen's whole job is to create one —
 * and deliberately outside /signin's, because an operator arriving here should
 * never see a code field they cannot use.
 */
export default function BadgePage() {
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
      </div>

      <BadgeSignIn />
    </main>
  )
}
