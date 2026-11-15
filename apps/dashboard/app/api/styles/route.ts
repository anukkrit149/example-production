import { CreateStyleInput } from '@hf/contracts'
import { createStyle, handle, json, readMutation } from '@hf/server'
import { requireUser } from '@/lib/auth'

export const POST = handle(async (req) => {
  await requireUser(['merchandiser'])
  const { input, idempotencyKey } = await readMutation(req, CreateStyleInput)
  const { result, replayed } = await createStyle(input, idempotencyKey)
  return json({ style: result, replayed }, { status: replayed ? 200 : 201 })
})
