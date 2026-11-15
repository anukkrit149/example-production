import { handle, json, publishDraft } from '@hf/server'
import { requireUser } from '@/lib/auth'

export const POST = handle(async (_req, ctx) => {
  const user = await requireUser(['admin'])
  const { id } = await ctx.params
  return json({ checklist: await publishDraft(id, user.id) })
})
