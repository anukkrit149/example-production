import { prisma } from '@hf/db'
import { devAuthEnabled } from '@/lib/auth'
import { devLogin } from './actions'

/**
 * Never prerendered. This page reads DEV_AUTH and the live `users` table, both
 * of which differ between the build machine and the running server; baking it
 * would ship one machine's team list as static HTML.
 */
export const dynamic = 'force-dynamic'

export default async function DevLogin() {
  if (!devAuthEnabled()) return <p className="p-6">Development sign-in is disabled.</p>
  const users = await prisma.user.findMany({ where: { active: true }, orderBy: [{ role: 'asc' }, { name: 'asc' }] })
  return (
    <main className="mx-auto max-w-sm p-6">
      <h1 className="hf-display mb-4 text-xl">Sign in as</h1>
      <div className="grid gap-2">
        {users.map((u) => (
          <form key={u.id} action={devLogin}>
            <input type="hidden" name="identity" value={u.authIdentity} />
            <button className="h-10 w-full rounded-md border px-4 text-left" style={{ borderColor: 'var(--hf-line)', background: 'var(--hf-card)' }}>
              {u.name} <span style={{ color: 'var(--hf-muted)' }}>· {u.role}</span>
            </button>
          </form>
        ))}
      </div>
    </main>
  )
}
