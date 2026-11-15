import { notFound, redirect } from 'next/navigation'
import { getReceipt, listInventoryItems } from '@hf/server'
import { getCurrentUser } from '@/lib/auth'
import { CountForm } from './CountForm'

/** Store and admin only, like the route behind it; anyone else gets a 404 rather than a form the server would refuse. */
export default async function CountPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) redirect('/signin')
  if (user.role !== 'store' && user.role !== 'admin') notFound()
  const { id } = await params
  const [receipt, items] = await Promise.all([getReceipt(id), listInventoryItems()])
  if (!receipt) notFound()
  return (
    <main className="grid gap-5 p-4">
      <CountForm receipt={receipt} items={items.map((i) => ({ id: i.id, code: i.code, nameEn: i.nameEn, nameHi: i.nameHi, unit: i.unit }))} />
    </main>
  )
}
