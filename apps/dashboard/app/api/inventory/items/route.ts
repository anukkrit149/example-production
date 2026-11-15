import { CreateInventoryItemInput } from '@hf/contracts'
import { createInventoryItem, handle, json, readMutation } from '@hf/server'
import { requireUser } from '@/lib/auth'

export const POST = handle(async (req) => {
  await requireUser(['admin'])
  const { input, idempotencyKey } = await readMutation(req, CreateInventoryItemInput)
  const { result, replayed } = await createInventoryItem(input, idempotencyKey)
  return json({ item: result, replayed }, { status: replayed ? 200 : 201 })
})
