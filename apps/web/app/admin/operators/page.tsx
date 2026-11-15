import Image from 'next/image'
import Link from 'next/link'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { prisma } from '@hf/db'
import { getCurrentUser } from '@/lib/auth'
import { OperatorCodes, type CodeRow, type UserRow } from './OperatorCodes'

export const metadata = { title: 'Operators · Sample Factory' }

/**
 * Past its expiry, as of `now`.
 *
 * Lifted out of the component body because the render-purity rule — rightly —
 * forbids reading the clock during render. Taking `now` as an argument also
 * means every row in one page load is judged against a single instant.
 */
function isExpired(expiresAt: Date | null, now: number): boolean {
  return !!expiresAt && expiresAt.getTime() <= now
}

/**
 * The origin a printed card's QR will point at.
 *
 * Resolved per request, and emphatically NOT from a `NEXT_PUBLIC_` variable.
 * Those are inlined into the bundle at build time, so an image built in CI with
 * the default `http://localhost:3000` would carry that into every card ever
 * printed from it, and setting the variable on the running server afterwards
 * would change nothing. That failure is silent: it shows up as a stack of
 * printed cards that scan to nothing.
 *
 * So: `APP_URL` if someone set it — the escape hatch for a factory where the
 * admin's browser and the floor's phones reach the app by different names — and
 * otherwise the address this very request came in on, which is by construction
 * an address that works. `x-forwarded-proto` because the app sits behind a
 * proxy that terminates TLS; without it every card would say `http`.
 *
 * The check is on the trimmed value, not `??`: an `APP_URL=` left blank in a
 * `.env` file is an empty string rather than undefined, and would resolve every
 * QR to the relative path `/badge#…`, which decodes as text and signs nobody in.
 */
async function resolveBadgeOrigin(): Promise<string> {
  const configured = process.env.APP_URL?.trim()
  if (configured) return configured

  const h = await headers()
  const host = h.get('host') ?? 'localhost:3000'
  const proto = h.get('x-forwarded-proto')?.split(',')[0]?.trim() || 'http'
  return `${proto}://${host}`
}

/**
 * Who can get onto the floor, and with which credential.
 *
 * Admin only, checked here rather than left to the API: a non-admin should not
 * see the shape of this screen at all, let alone have it render and then fail
 * on every request it makes. Signed out goes to /signin; signed in but not an
 * admin goes back to Home, where they actually belong.
 *
 * `codeHash` is not selected — see the GET route for why. The page hands the
 * client only what an admin needs to tell codes apart and revoke one.
 */
export default async function AdminOperators() {
  const user = await getCurrentUser()
  if (!user) redirect('/signin')
  if (user.role !== 'admin') redirect('/home')

  // The clock comes from Postgres, which is also the clock every expiry was
  // written against — and, conveniently, is a value the render-purity rule is
  // happy with, unlike calling Date.now() in a component body.
  const badgeOrigin = await resolveBadgeOrigin()

  const [now, users, codes] = await Promise.all([
    prisma
      .$queryRaw<[{ now: Date }]>`SELECT now() as now`
      .then((r) => r[0].now.getTime()),
    prisma.user.findMany({
      where: { active: true },
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, role: true },
    }),
    prisma.operatorCode.findMany({
      orderBy: [{ revokedAt: 'asc' }, { issuedAt: 'desc' }],
      select: {
        id: true,
        kind: true,
        last4: true,
        issuedAt: true,
        expiresAt: true,
        revokedAt: true,
        lastUsedAt: true,
        user: { select: { id: true, name: true, role: true, active: true } },
        issuedBy: { select: { id: true, name: true } },
      },
    }),
  ])

  // Dates cross the server/client boundary as ISO strings so the client can
  // format them in the viewer's locale. `expired` is resolved here rather than
  // during render, against the same `now` for every row — reading the clock
  // inside a render body makes the output depend on when React happened to run,
  // and per-row clock reads could disagree with each other mid-list.
  const rows: CodeRow[] = codes.map((c) => ({
    ...c,
    issuedAt: c.issuedAt.toISOString(),
    expiresAt: c.expiresAt?.toISOString() ?? null,
    revokedAt: c.revokedAt?.toISOString() ?? null,
    lastUsedAt: c.lastUsedAt?.toISOString() ?? null,
    expired: isExpired(c.expiresAt, now),
  }))

  return (
    <main
      className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-6 px-5 py-6"
      style={{ background: 'var(--hf-paper)' }}
    >
      <header className="grid gap-4">
        <div className="flex items-center justify-between">
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
          <span className="hf-label text-[10px]" style={{ color: 'var(--hf-oxblood-lit)' }}>
            Admin
          </span>
        </div>
        <h1 className="hf-display text-2xl" style={{ color: 'var(--hf-ink)' }}>
          Operators
        </h1>
      </header>

      {/*
        The same two-item admin strip Home and the labels page show — Codes is
        this screen, so it does not repeat itself, but Labels is one tap from
        here without a trip back through Home. Plain English, like the rest of
        this page: it predates the bilingual checkpoint screens and has no
        LanguageProvider or slider of its own.
      */}
      <nav className="flex gap-4">
        <span className="hf-label whitespace-nowrap text-[10px]" style={{ color: 'var(--hf-oxblood-lit)' }}>
          Codes
        </span>
        <Link href="/admin/labels" className="hf-label whitespace-nowrap text-[10px]" style={{ color: 'var(--hf-ink)' }}>
          Labels
        </Link>
      </nav>

      <OperatorCodes users={users as UserRow[]} codes={rows} badgeOrigin={badgeOrigin} />

      <Link href="/scan" className="hf-ui text-base underline" style={{ color: 'var(--hf-muted)' }}>
        Back to the floor
      </Link>
    </main>
  )
}
