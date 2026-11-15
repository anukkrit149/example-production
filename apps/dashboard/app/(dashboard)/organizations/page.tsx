import { listOrganizations } from '@hf/server'
import { Drawer } from '@/components/Drawer'
import { OrganizationForm } from '@/components/forms/OrganizationForm'
import { Empty, PageHeader } from '@/components/ui'
import { pageUser } from '@/lib/page-user'
import { canWrite } from '@/lib/roles'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Buyers · Sample Factory Dashboard' }

export default async function OrganizationsPage() {
  const user = await pageUser()
  const orgs = await listOrganizations()
  const write = canWrite(user)
  return (
    <>
      <PageHeader title="Buyers and buying houses">{write && <Drawer title="New buyer or buying house" trigger="New buyer or buying house"><OrganizationForm /></Drawer>}</PageHeader>
      {orgs.length === 0 ? <Empty>No organisations yet. Add the first buyer to start a program.</Empty> : (
        <table className="hf-table hf-cards w-full">
          <thead><tr><th>Name</th><th>Type</th><th className="hf-num">Programs as buyer</th><th className="hf-num">Programs as agent</th><th>Active</th>{write && <th />}</tr></thead>
          <tbody>
            {orgs.map((o) => (
              <tr key={o.id} style={{ opacity: o.active ? 1 : 0.6 }}>
                <td data-primary className="font-semibold">{o.name}</td>
                <td data-label="Type">{o.type === 'buyer' ? 'Buyer' : 'Buying house'}</td>
                <td data-label="Programs as buyer" className="hf-num">{o.buyerPrograms}</td><td data-label="Programs as agent" className="hf-num">{o.agentPrograms}</td><td data-label="Active">{o.active ? 'Yes' : 'No'}</td>
                {write && <td className="text-right"><Drawer title={`Edit ${o.name}`} trigger="Edit" variant="ghost"><OrganizationForm org={{ id: o.id, name: o.name, active: o.active }} /></Drawer></td>}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  )
}
