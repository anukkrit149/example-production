import { UpdateOrganizationInput } from '@hf/contracts'
import { handle, json, readJson, updateOrganization } from '@hf/server'
import { requireUser } from '@/lib/auth'

export const PATCH = handle(async (req, ctx) => {
  await requireUser(['merchandiser'])
  const { id } = await ctx.params
  const input = UpdateOrganizationInput.parse(await readJson(req))
  return json({ organization: await updateOrganization(id!, input) })
})
