import { UpdateInventoryItemInput } from '@hf/contracts'
import { handle, json, readJson, updateInventoryItem } from '@hf/server'
import { requireUser } from '@/lib/auth'

export const PATCH = handle(async (req, ctx) => {
  await requireUser(['admin'])
  const { id } = await ctx.params
  const input = UpdateInventoryItemInput.parse(await readJson(req))
  return json({ item: await updateInventoryItem(id, input) })
})
