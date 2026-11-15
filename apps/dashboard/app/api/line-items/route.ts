import { CreateLineItemInput } from '@hf/contracts'
import { createLineItem, handle, json, readMutation } from '@hf/server'
import { requireUser } from '@/lib/auth'

export const POST = handle(async (req) => {
  const user = await requireUser(['merchandiser'])
  const { input, idempotencyKey } = await readMutation(req, CreateLineItemInput)
  const r = await createLineItem(input, idempotencyKey, user.id)
  return json(r, { status: r.replayed ? 200 : 201 })
})
