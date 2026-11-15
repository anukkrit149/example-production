import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { DEV_COOKIE } from '@/lib/auth'

/**
 * Drops the development identity cookie and returns to the real sign-in screen,
 * which links on to the dev picker while DEV_AUTH is on. Kept for the dev flow
 * only — the floor signs out through POST /api/auth/signout, which also revokes
 * the session row.
 */
export async function GET() {
  const jar = await cookies()
  jar.delete(DEV_COOKIE)
  redirect('/signin')
}
