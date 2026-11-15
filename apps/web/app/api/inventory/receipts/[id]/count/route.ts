import { CountReceiptInput } from '@hf/contracts'
import { countReceipt, handle, json, readMutation } from '@hf/server'
import { requireUser } from '@/lib/auth'

/** The tally against the paper. Store and admin only; once per receipt. */
export const POST = handle(async (req, ctx) => {
  const user = await requireUser(['store'])
  const { id } = await ctx.params
  const { input, idempotencyKey } = await readMutation(req, CountReceiptInput)
  const { receipt, replayed } = await countReceipt({ id, input, user, idempotencyKey })
  return json({ receipt, replayed })
})
