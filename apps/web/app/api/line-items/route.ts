import { handle, json } from '@hf/server'
import { requireUser } from '@/lib/auth'
import { listLineItems } from '@/lib/line-items'

/**
 * The work available to cut. Read-only and open to any signed-in user: a QA
 * checker or a supervisor looking at the same list is not a write, and gating
 * it by role would only mean the store operator's phone shows an empty screen
 * when someone else is signed in on it.
 */
export const GET = handle(async () => {
  await requireUser()
  return json({ lineItems: await listLineItems() })
})
