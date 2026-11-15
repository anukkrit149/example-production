import { prisma } from '@hf/db'
import { SuggestInput } from '@hf/contracts'
import { ApiError, handle, json, listInventoryItems, photoUrl, suggestFromPhoto, visionAvailable } from '@hf/server'
import { requireUser } from '@/lib/auth'

/**
 * Photo → suggestion. Reads the confirmed attachment back out of the bucket
 * through its own signed url (the bucket is private; the Worker is the only
 * thing allowed to fetch it), hands the bytes to Gemini, and returns whatever
 * came back — or `available: false`, which the form treats as "nothing to
 * prefill". Nothing here is written to the database.
 */
export const POST = handle(async (req) => {
  await requireUser()
  const input = SuggestInput.parse(await req.json().catch(() => { throw new ApiError(400, 'body must be JSON', 'bad_json') }))
  const att = await prisma.attachment.findUnique({ where: { id: input.attachmentId } })
  if (!att) throw new ApiError(404, 'attachment not found', 'not_found')
  if (!att.confirmedAt) throw new ApiError(422, 'photo upload did not complete', 'upload_missing')
  if (att.bytes > 2_000_000) return json({ available: false })
  if (!visionAvailable()) return json({ available: false })

  const items = await listInventoryItems()
  // Any failure downstream of here — the bucket unreachable, a timeout, Gemini
  // erroring — degrades to "nothing to prefill" rather than a 500. The phone
  // still has a bare form to fill in by hand.
  try {
    const res = await fetch(await photoUrl(att.storageKey))
    if (!res.ok) return json({ available: false })
    const base64 = Buffer.from(await res.arrayBuffer()).toString('base64')
    return json(await suggestFromPhoto({ kind: input.kind, image: { base64, mime: att.mime }, items: items.map((i) => ({ code: i.code, nameEn: i.nameEn, nameHi: i.nameHi })) }))
  } catch {
    return json({ available: false })
  }
})
