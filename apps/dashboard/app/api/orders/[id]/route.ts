import { UpdateOrderInput } from '@hf/contracts'
import { handle, json, orderJson, readJson, updateOrder } from '@hf/server'
import { requireUser } from '@/lib/auth'

export const PATCH = handle(async (req, ctx) => {
  await requireUser(['merchandiser'])
  const { id } = await ctx.params
  const input = UpdateOrderInput.parse(await readJson(req))
  return json({ order: orderJson(await updateOrder(id, input)) })
})
