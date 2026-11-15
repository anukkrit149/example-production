import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { HomeDoors } from './HomeDoors'

/**
 * The front door, past sign-in.
 *
 * Every role lands here first and picks one of three doors — nothing here is
 * gated by role, because the checkpoint app has never had a screen only some
 * roles are trusted to look at. What differs by role is what shows up below
 * the doors: admin gets the strip to Codes and Labels, store and supervisor
 * get the quiet line to Labels, everyone else gets nothing more.
 */
export default async function HomePage() {
  const user = await getCurrentUser()
  if (!user) redirect('/signin')

  return (
    <main className="grid gap-6 p-4">
      <HomeDoors role={user.role} />
    </main>
  )
}
