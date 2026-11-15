import { listOrders } from '@hf/server'
import { OrdersTable } from '@/components/OrdersTable'
import { PageHeader } from '@/components/ui'
import { pageUser } from '@/lib/page-user'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Orders · Sample Factory Dashboard' }

/** Every order across programs, soonest due first. New orders are created from their program. */
export default async function OrdersPage() {
  await pageUser()
  const orders = await listOrders()
  return (
    <>
      <PageHeader title="Orders" />
      <OrdersTable orders={orders} showProgram />
    </>
  )
}
