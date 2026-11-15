import { redirect } from 'next/navigation'
import { Header } from '@/components/Header'
import { MobileNav } from '@/components/MobileNav'
import { Sidebar } from '@/components/Sidebar'
import { whoAmI } from '@/lib/auth'
import { isAdmin } from '@/lib/roles'
import { NotOnTeam } from './NotOnTeam'

/**
 * The frame every dashboard screen sits in, and the gate: no user means the
 * sign-in page; a Neon session whose email is not on the team means the
 * not-on-team screen. Routes enforce roles on their own; this is the courtesy.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, signedInEmail } = await whoAmI()
  if (!user) {
    if (signedInEmail) return <NotOnTeam email={signedInEmail} />
    redirect('/signin')
  }
  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <Sidebar isAdmin={isAdmin(user)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileNav isAdmin={isAdmin(user)} name={user.name} role={user.role} neon={Boolean(signedInEmail)} />
        <Header name={user.name} role={user.role} neon={Boolean(signedInEmail)} />
        <main className="flex-1 px-4 py-4 md:px-8 md:py-6">{children}</main>
      </div>
    </div>
  )
}
