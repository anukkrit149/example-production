import { redirect } from 'next/navigation'
import { listTeam } from '@hf/server'
import { Drawer } from '@/components/Drawer'
import { TeamMemberForm } from '@/components/forms/TeamMemberForm'
import { PageHeader } from '@/components/ui'
import { pageUser } from '@/lib/page-user'
import { isAdmin } from '@/lib/roles'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Team · Sample Factory Dashboard' }

export default async function TeamPage() {
  const user = await pageUser()
  if (!isAdmin(user)) redirect('/overview')
  const team = await listTeam()
  return (
    <>
      <PageHeader title="Team"><Drawer title="Add to team" trigger="Add"><TeamMemberForm /></Drawer></PageHeader>
      <p className="mb-4 text-sm" style={{ color: 'var(--hf-muted)' }}>Office users sign in with their email. People without an email sign in on the phone with a code issued from its Admin screen.</p>
      <table className="hf-table hf-cards w-full">
        <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Active</th><th /></tr></thead>
        <tbody>
          {team.map((m) => (
            <tr key={m.id} style={{ opacity: m.active ? 1 : 0.6 }}>
              <td data-primary className="font-semibold">{m.name}</td>
              <td data-label="Email" style={{ color: m.email ? undefined : 'var(--hf-muted)' }}>{m.email ?? 'signs in with a code'}</td>
              <td data-label="Role">{m.role}</td><td data-label="Active">{m.active ? 'Yes' : 'No'}</td>
              <td className="text-right"><Drawer title={`Edit ${m.name}`} trigger="Edit" variant="ghost"><TeamMemberForm member={{ id: m.id, name: m.name, role: m.role, active: m.active }} /></Drawer></td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}
