import Image from 'next/image'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { SignOutButton } from '@/components/SignOutButton'
import { HomeLink } from '@/components/HomeLink'
import { LanguageSlider } from '@/components/LanguageSlider'
import { LanguageProvider } from '@/lib/i18n/LanguageProvider'

/**
 * The frame every checkpoint screen sits in.
 *
 * `max-w-md` centred, because this is a phone app first and a desk browser
 * second. The header carries the lockup at its 140 px floor, then who you are
 * signed in as — an operator handing the phone to a QA checker needs to see the
 * name change without hunting for it.
 */
export default async function CheckpointLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser()
  // Real sign-in, not the dev picker. /dev-login still works behind DEV_AUTH,
  // and /signin links to it there, but the floor's front door is the code screen.
  if (!user) redirect('/signin')

  return (
    <LanguageProvider>
      <div
        className="mx-auto flex min-h-dvh w-full max-w-md flex-col text-base"
        style={{ background: 'var(--hf-paper)' }}
      >
        <header
          className="sticky top-0 z-10 border-b"
          style={{ borderColor: 'var(--hf-line)', background: 'var(--hf-paper)' }}
        >
          <div className="flex items-center justify-between gap-3 px-4 pb-2 pt-3">
            <Link href="/scan" aria-label="Sample Factory — scan">
              <Image
                src="/brand/hf-lockup-header-light.svg"
                alt="Sample Factory"
                width={160}
                height={19}
                priority
                className="h-[19px] w-[160px]"
              />
            </Link>
            <LanguageSlider />
            <div className="flex items-baseline gap-3">
              <span
                className="hf-label whitespace-nowrap text-[10px]"
                style={{ color: 'var(--hf-oxblood-lit)' }}
              >
                {user.role}
              </span>
              <SignOutButton />
            </div>
          </div>

          {/*
            One line, no wrapping. The single Home link keeps its natural
            width; the identity takes what is left and truncates, since the
            name matters more than the role spelled out.
          */}
          <div className="flex items-baseline justify-between gap-3 px-4 pb-2">
            <HomeLink />
            <span
              className="hf-ui min-w-0 truncate text-[11px] uppercase"
              style={{ color: 'var(--hf-muted)' }}
            >
              {user.name}
            </span>
          </div>
        </header>

        <div className="flex-1">{children}</div>
      </div>
    </LanguageProvider>
  )
}
