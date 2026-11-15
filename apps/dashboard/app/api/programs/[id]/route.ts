import { UpdateProgramInput } from '@hf/contracts'
import { handle, json, readJson, updateProgram } from '@hf/server'
import { requireUser } from '@/lib/auth'

export const PATCH = handle(async (req, ctx) => {
  await requireUser(['merchandiser'])
  const { id } = await ctx.params
  const input = UpdateProgramInput.parse(await readJson(req))
  return json({ program: await updateProgram(id, input) })
})
