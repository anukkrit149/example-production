import { cartonsForOrder, handle, json, ApiError, ordersWithPacked } from '@hf/server'
import { requireUser } from '@/lib/auth'
export const GET = handle(async (req) => {
  await requireUser()
  const url = new URL(req.url)
  if (url.searchParams.get('withPacked') === '1') return json({ orders: await ordersWithPacked() })
  const orderId = url.searchParams.get('orderId')
  if (!orderId) throw new ApiError(400, 'orderId is required', 'validation')
  return json({ cartons: await cartonsForOrder(orderId) })
})
