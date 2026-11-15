import { redirect } from 'next/navigation'
import { listReceipts } from '@hf/server'
import { getCurrentUser } from '@/lib/auth'
import { InventoryHome } from './InventoryHome'

/**
 * The store-room door for deliveries. Everyone can record one; the count
 * queue is the store's job, so it only renders for store and admin.
 */
export default async function InventoryPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/signin')
  const canCount = user.role === 'store' || user.role === 'admin'
  const [toCount, recent] = await Promise.all([
    canCount ? listReceipts({ status: 'RECEIVED', limit: 50 }) : Promise.resolve({ receipts: [], nextBefore: null }),
    listReceipts({ receivedById: user.id, limit: 5 }),
  ])
  return (
    <main className="grid gap-5 p-4">
      <InventoryHome canCount={canCount} toCount={toCount.receipts} recent={recent.receipts} />
    </main>
  )
}
