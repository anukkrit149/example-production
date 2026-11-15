import { UpdateTeamMemberInput } from '@hf/contracts'
import { handle, json, readJson, updateTeamMember } from '@hf/server'
import { requireUser } from '@/lib/auth'

export const PATCH = handle(async (req, ctx) => {
  const user = await requireUser(['admin'])
  const { id } = await ctx.params
  const input = UpdateTeamMemberInput.parse(await readJson(req))
  return json({ user: await updateTeamMember(id, input, user.id) })
})
