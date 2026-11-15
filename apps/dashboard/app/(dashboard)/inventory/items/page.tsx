import Link from 'next/link'
import { notFound } from 'next/navigation'
import { listInventoryItems } from '@hf/server'
import { Drawer } from '@/components/Drawer'
import { InventoryItemForm } from '@/components/inventory/InventoryItemForm'
import { Empty, PageHeader } from '@/components/ui'
import { pageUser } from '@/lib/page-user'
import { isAdmin } from '@/lib/roles'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Inventory items · Sample Factory Dashboard' }

/** The item list is configuration: what the phone offers as chips. Admin only. */
export default async function InventoryItemsPage() {
  const user = await pageUser()
  if (!isAdmin(user)) notFound()
  const items = await listInventoryItems({ includeInactive: true })
  return (
    <>
      <PageHeader eyebrow={<Link href="/inventory" className="hover:underline">Inventory</Link>} title="Items"><Drawer title="New item" trigger="New item"><InventoryItemForm /></Drawer></PageHeader>
      {items.length === 0 ? <Empty>No items yet.</Empty> : (
        <table className="hf-table hf-cards w-full">
          <thead><tr><th>Code</th><th>English</th><th>Hindi</th><th>Unit</th><th className="hf-num">Position</th><th>Active</th><th></th></tr></thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id} style={{ opacity: i.active ? 1 : 0.6 }}>
                <td data-primary className="font-mono font-semibold">{i.code}</td>
                <td data-label="English">{i.nameEn}</td><td data-label="Hindi" lang="hi">{i.nameHi}</td><td data-label="Unit">{i.unit}</td>
                <td data-label="Position" className="hf-num">{i.position}</td><td data-label="Active">{i.active ? 'Yes' : 'No'}</td>
                <td><Drawer title={`Edit ${i.code}`} trigger="Edit" variant="ghost"><InventoryItemForm item={i} /></Drawer></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  )
}
