import { ApiError, getReceipt, handle, json } from '@hf/server'
import { requireUser } from '@/lib/auth'

export const GET = handle(async (_req, ctx) => {
  await requireUser()
  const { id } = await ctx.params
  const receipt = await getReceipt(id)
  if (!receipt) throw new ApiError(404, 'receipt not found', 'not_found')
  return json({ receipt })
})
