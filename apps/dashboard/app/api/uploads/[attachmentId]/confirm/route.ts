import { prisma } from '@hf/db'
import { ApiError, handle, json, objectExists } from '@hf/server'
import { requireUser } from '@/lib/auth'

export const POST = handle(async (_req, ctx) => {
  await requireUser()
  const { attachmentId } = await ctx.params
  const att = await prisma.attachment.findUnique({ where: { id: attachmentId } })
  if (!att) throw new ApiError(404, 'attachment not found', 'not_found')

  // Never take the client's word for it. A photo is the evidence in a dispute,
  // so the event may only reference an object the bucket really holds.
  const head = await objectExists(att.storageKey)
  if (!head.exists) throw new ApiError(422, 'photo upload did not complete', 'upload_missing')

  await prisma.attachment.update({
    where: { id: att.id },
    data: { bytes: head.bytes, confirmedAt: new Date() },
  })
  return json({ ok: true })
})
