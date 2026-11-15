import { ChangeQuantityInput } from '@hf/contracts'
import { changeQuantity, handle, json, readMutation } from '@hf/server'
import { requireUser } from '@/lib/auth'

export const POST = handle(async (req, ctx) => {
  const user = await requireUser(['merchandiser'])
  const { id } = await ctx.params
  const { input, idempotencyKey } = await readMutation(req, ChangeQuantityInput)
  return json(await changeQuantity({ lineItemId: id, input, user, idempotencyKey }))
})
