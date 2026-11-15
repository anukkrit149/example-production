import { prisma } from '@hf/db'
import { devAuthEnabled } from '@/lib/auth'
import { devLogin } from './actions'

export default async function DevLogin() {
  if (!devAuthEnabled()) return <p className="p-6">Development sign-in is disabled.</p>
  const users = process.env.HF_E2E_MOCK === '1'
    ? (await import('@/e2e-mock/roster')).activeUsers()
    : await prisma.user.findMany({ where: { active: true }, orderBy: { role: 'asc' } })
  return (
    <main className="mx-auto max-w-sm p-6">
      <h1 className="mb-4 text-xl font-semibold">Sign in as</h1>
      <div className="grid gap-3">
        {users.map((u) => (
          <form key={u.id} action={devLogin}>
            <input type="hidden" name="identity" value={u.authIdentity} />
            <button className="h-14 w-full rounded-md border text-left px-4">{u.name} <span className="text-neutral-500">· {u.role}</span></button>
          </form>
        ))}
      </div>
    </main>
  )
}
