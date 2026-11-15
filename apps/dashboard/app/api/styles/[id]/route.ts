import { UpdateStyleInput } from '@hf/contracts'
import { handle, json, readJson, updateStyle } from '@hf/server'
import { requireUser } from '@/lib/auth'

export const PATCH = handle(async (req, ctx) => {
  await requireUser(['merchandiser'])
  const { id } = await ctx.params
  const input = UpdateStyleInput.parse(await readJson(req))
  return json({ style: await updateStyle(id, input) })
})
