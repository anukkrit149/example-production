import { getChecklist, handle, json } from '@hf/server'
import { requireUser } from '@/lib/auth'

export const GET = handle(async (_req, ctx) => {
  await requireUser(['admin'])
  const { id } = await ctx.params
  return json({ checklist: await getChecklist(id) })
})
