import { batchFile, handle } from '@hf/server'
import { requireUser } from '@/lib/auth'

export const GET = handle(async (_req, ctx) => {
  await requireUser()
  const { batchId } = await ctx.params
  const r = await batchFile(batchId)
  return new Response(r.body as BodyInit, { headers: { 'content-type': r.contentType, 'content-disposition': `attachment; filename="${r.filename}"` } })
})
