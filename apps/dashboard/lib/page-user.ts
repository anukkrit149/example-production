import { redirect } from 'next/navigation'
import type { User } from '@hf/db'
import { getCurrentUser } from './auth'

/** For pages inside the (dashboard) group; the layout has already gated, this just types it. */
export async function pageUser(): Promise<User> {
  const user = await getCurrentUser()
  if (!user) redirect('/signin')
  return user
}
