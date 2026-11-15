import { cookies } from 'next/headers'
import { prisma, type User, type UserRole } from '@hf/db'
import { ApiError, devAuthEnabled } from '@hf/server'
import { hashSecret, isLive, LAST_SEEN_THROTTLE_MS, SESSION_COOKIE } from './operator-code'
export { ApiError }
/**
 * Re-exported so this app's pages and actions keep importing it from
 * '@/lib/auth' alongside DEV_COOKIE. The definition itself lives in
 * packages/server/src/dev-auth.ts, shared with the dashboard: one predicate,
 * one place to get the Workers refusal right.
 */
export { devAuthEnabled }

export const DEV_COOKIE = 'hf_dev_user'

/**
 * Who is holding the phone.
 *
 * Resolution order is deliberate. The operator session comes first so a real
 * sign-in always wins, even on a developer machine that still has DEV_AUTH on
 * and a stale dev cookie in the jar. The dev fallback survives only behind the
 * DEV_AUTH flag, which is off everywhere but local work and the test suite.
 *
 * Every check that mattered at sign-in is repeated here, on every request:
 * revocation and deactivation have to take effect on the operator's next tap,
 * not at some future re-login. The session row is the source of truth — the
 * cookie carries nothing but an opaque token — so revoking a session or
 * deactivating a user logs the phone out without anyone touching the device.
 */
export async function getCurrentUser(): Promise<User | null> {
  // The canned browser suite has no database. The dev cookie still names who
  // is holding the phone; the user row comes from the scenario roster.
  if (process.env.HF_E2E_MOCK === '1') {
    const { mockCurrentUser } = await import('@/e2e-mock/current-user')
    return mockCurrentUser()
  }

  const jar = await cookies()

  const token = jar.get(SESSION_COOKIE)?.value
  if (token) {
    const user = await resolveOperatorSession(token)
    if (user) return user
  }

  if (!devAuthEnabled()) return null
  const identity = jar.get(DEV_COOKIE)?.value
  if (!identity) return null
  return prisma.user.findFirst({ where: { authIdentity: identity, active: true } })
}

/**
 * A session token to a user, or null for every failure mode.
 *
 * The lookup is by hash, so the plaintext token is never a query predicate and
 * never lands in a query log. There is no timing-safe compare here on purpose:
 * this is a unique-index point lookup on a 256-bit random value, not a
 * comparison against a supplied guess, so there is no partial match for timing
 * to leak. Where a supplied secret IS compared against a stored one — the code
 * sign-in path — `safeEqualHex` does that work.
 */
async function resolveOperatorSession(token: string): Promise<User | null> {
  const session = await prisma.operatorSession.findUnique({
    where: { tokenHash: hashSecret(token) },
    include: { user: true },
  })
  if (!session) return null
  if (!isLive(session)) return null
  if (!session.user.active) return null

  // Throttled: a bench phone moving between screens must not cost a write each time.
  const now = Date.now()
  if (now - session.lastSeenAt.getTime() > LAST_SEEN_THROTTLE_MS) {
    await prisma.operatorSession
      .update({ where: { id: session.id }, data: { lastSeenAt: new Date(now) } })
      .catch(() => {})
  }

  return session.user
}

export async function requireUser(roles?: UserRole[]): Promise<User> {
  const user = await getCurrentUser()
  if (!user) throw new ApiError(401, 'sign in required', 'unauthenticated')
  if (roles && !roles.includes(user.role) && user.role !== 'admin') throw new ApiError(403, `requires role ${roles.join(' or ')}`, 'forbidden')
  return user
}
