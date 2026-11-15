import { CreateProgramInput } from '@hf/contracts'
import { createProgram, handle, json, readMutation } from '@hf/server'
import { requireUser } from '@/lib/auth'

export const POST = handle(async (req) => {
  await requireUser(['merchandiser'])
  const { input, idempotencyKey } = await readMutation(req, CreateProgramInput)
  const { result, replayed } = await createProgram(input, idempotencyKey)
  return json({ program: result, replayed }, { status: replayed ? 200 : 201 })
})
