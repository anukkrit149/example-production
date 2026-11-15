import { handle, json, listInventoryItems } from '@hf/server'
import { requireUser } from '@/lib/auth'

/** The chips on the receive screen: active items in display order. */
export const GET = handle(async () => {
  await requireUser()
  return json({ items: await listInventoryItems() })
})
