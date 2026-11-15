import { cache } from 'react'
import { cookies } from 'next/headers'
import { prisma, type User, type UserRole } from '@hf/db'
import { ApiError, devAuthEnabled, emailIdentity, isAutoAdminEmail } from '@hf/server'
export { ApiError }

export const DEV_COOKIE = 'hf_dev_user'
export { emailIdentity, devAuthEnabled }

export type WhoAmI = { user: User | null; signedInEmail: string | null }

/**
 * The Neon Auth session's email (lowercased) and display name, or null.
 *
 * Imported dynamically so a machine (or a test worker) with no NEON_AUTH_BASE_URL
 * never evaluates the SDK. The dev cookie below is the only other door and it
 * exists only behind DEV_AUTH.
 */
/** The SDK's primary auth cookie: `__Secure-neon-auth.session_token`, matched on the suffix so a prefix change cannot silently break the check. */
const NEON_SESSION_COOKIE_SUFFIX = '.session_token'

/**
 * True when the request carries a Neon session cookie at all. Without one the
 * auth server cannot answer with a session, yet the SDK still makes the round
 * trip (200–800 ms measured from the Worker) — on every signed-out hit, every
 * sign-in page load and every redirect. Skipping it costs nothing: the only way
 * to gain a session is to sign in, which sets the cookie.
 */
async function hasNeonSessionCookie(): Promise<boolean> {
  const jar = await cookies()
  // The integration tests stub `cookies()` with a bare `get`; treat that as "unknown" and let the SDK decide.
  if (typeof (jar as { getAll?: unknown }).getAll !== 'function') return true
  return jar.getAll().some((c) => c.name.endsWith(NEON_SESSION_COOKIE_SUFFIX) && c.value !== '')
}

async function neonSession(): Promise<{ email: string; name: string | null } | null> {
  if (!process.env.NEON_AUTH_BASE_URL) return null
  if (!(await hasNeonSessionCookie())) return null
  const { auth } = await import('./auth-server')
  const { data } = await auth.getSession()
  const u = (data as { user?: { email?: string; name?: string } } | null)?.user
  const email = u?.email?.trim().toLowerCase()
  if (!email) return null
  const name = u?.name?.trim()
  return { email, name: name ? name : null }
}

/**
 * The row behind a Neon email, creating it for company addresses.
 *
 * Anyone on a company domain (see AUTO_ADMIN_DOMAINS) is an admin by default:
 * their first sign-in creates an active admin row, so the very first person in
 * never needs SQL and everyone after can be added on /team or just sign in.
 * `upsert` with an empty update makes two simultaneous first requests safe, and
 * it also returns a row an admin has deactivated — which the caller then treats
 * as not on the team, exactly like any other inactive user.
 */
async function userForEmail(email: string, name: string | null): Promise<User | null> {
  const authIdentity = emailIdentity(email)
  const existing = await prisma.user.findUnique({ where: { authIdentity } })
  if (existing) return existing
  if (!isAutoAdminEmail(email)) return null
  return prisma.user.upsert({
    where: { authIdentity },
    update: {},
    create: { name: name ?? email.slice(0, email.indexOf('@')), role: 'admin', authIdentity },
  })
}

/**
 * Who is at the keyboard, and whether they are on the team.
 *
 * Identity comes from Neon Auth; authority comes from our own `users` row. A
 * valid sign-in with no matching active row is "signed in, not on the team" —
 * the layout shows that screen instead of the dashboard, and every route
 * answers 403. Nobody outside the company domains self-enrols; an admin adds
 * them on /team. Company addresses are provisioned as admins on first sign-in.
 *
 * Wrapped in React's `cache` so the layout's gate and the page's `pageUser()`
 * share ONE Neon Auth round trip and one users lookup per request instead of
 * two each; the cache is per request, so nothing leaks between users.
 */
export const whoAmI = cache(async (): Promise<WhoAmI> => {
  const session = await neonSession()
  if (session) {
    const row = await userForEmail(session.email, session.name)
    return { user: row && row.active ? row : null, signedInEmail: session.email }
  }

  if (!devAuthEnabled()) return { user: null, signedInEmail: null }
  const jar = await cookies()
  const identity = jar.get(DEV_COOKIE)?.value
  if (!identity) return { user: null, signedInEmail: null }
  const user = await prisma.user.findFirst({ where: { authIdentity: identity, active: true } })
  return { user, signedInEmail: null }
})

export async function getCurrentUser(): Promise<User | null> {
  return (await whoAmI()).user
}

export async function requireUser(roles?: UserRole[]): Promise<User> {
  const { user, signedInEmail } = await whoAmI()
  if (!user) {
    if (signedInEmail) throw new ApiError(403, 'your email is not on the team list', 'not_on_team')
    throw new ApiError(401, 'sign in required', 'unauthenticated')
  }
  if (roles && !roles.includes(user.role) && user.role !== 'admin')
    throw new ApiError(403, `requires role ${roles.join(' or ')}`, 'forbidden')
  return user
}
