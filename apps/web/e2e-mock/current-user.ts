import { cookies } from 'next/headers'
import type { User } from '@hf/db'
import { userByIdentity } from './roster'

/** Same cookie `DEV_COOKIE` sets in `@/lib/auth`. Duplicated so this module does not import auth back. */
const DEV_COOKIE = 'hf_dev_user'

/**
 * Who is signed in, read from the dev cookie against the roster file.
 *
 * Operator sessions and Prisma stay out of this path. The cookie is still the
 * one `/dev-login` sets, so the screens see a real `User` shape.
 */
export async function mockCurrentUser(): Promise<User | null> {
  const jar = await cookies()
  const identity = jar.get(DEV_COOKIE)?.value
  if (!identity) return null
  return userByIdentity(identity)
}
