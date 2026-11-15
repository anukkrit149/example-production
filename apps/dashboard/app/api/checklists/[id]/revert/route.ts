import { handle, json, revertOverride } from '@hf/server'
import { requireUser } from '@/lib/auth'

export const POST = handle(async (_req, ctx) => {
  await requireUser(['admin'])
  const { id } = await ctx.params
  await revertOverride(id)
  return json({ ok: true })
})
