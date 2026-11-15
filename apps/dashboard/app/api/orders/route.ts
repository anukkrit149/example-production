import { CreateOrderInput } from '@hf/contracts'
import { createOrder, handle, json, orderJson, readMutation } from '@hf/server'
import { requireUser } from '@/lib/auth'

export const POST = handle(async (req) => {
  await requireUser(['merchandiser'])
  const { input, idempotencyKey } = await readMutation(req, CreateOrderInput)
  const { result, replayed } = await createOrder(input, idempotencyKey)
  return json({ order: orderJson(result), replayed }, { status: replayed ? 200 : 201 })
})
