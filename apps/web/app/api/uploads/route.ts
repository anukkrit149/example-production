import { z } from 'zod'
import { prisma } from '@hf/db'
import { ApiError, handle, json, presignPhotoUpload } from '@hf/server'
import { requireUser } from '@/lib/auth'

const Input = z.object({
  mime: z.enum(['image/jpeg', 'image/webp']),
  bytes: z.number().int().min(1).max(2_000_000),
})

export const POST = handle(async (req) => {
  const user = await requireUser()
  const body = await req.json().catch(() => { throw new ApiError(400, 'body must be JSON', 'bad_json') })
  const input = Input.parse(body)

  const ext = input.mime === 'image/webp' ? 'webp' : 'jpg'
  const day = new Date().toISOString().slice(0, 10)
  const storageKey = `photos/${day}/${crypto.randomUUID()}.${ext}`

  // The row is created unlinked (pieceEventId null) and unconfirmed; the
  // confirm route is what proves the bytes reached the bucket.
  const att = await prisma.attachment.create({
    data: { storageKey, mime: input.mime, bytes: input.bytes, takenById: user.id },
  })
  const uploadUrl = await presignPhotoUpload(storageKey, input.mime)

  return json({ attachmentId: att.id, uploadUrl, storageKey })
})
