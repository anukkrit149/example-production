import { redirect } from 'next/navigation'
import { ordersWithPacked } from '@hf/server'
import { getCurrentUser } from '@/lib/auth'
import { ShipForm } from './ShipForm'

/**
 * The entry point for shipping: every order that currently has a packed
 * piece waiting, so a store operator picks from a short list instead of
 * typing an order number they might get wrong.
 */
export default async function ShipPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/signin')
  const orders = await ordersWithPacked()
  return (
    <main className="grid gap-4 p-4">
      <ShipForm orders={orders} signedBy={{ name: user.name, role: user.role }} />
    </main>
  )
}
