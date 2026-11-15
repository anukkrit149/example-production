import { CreateTeamMemberInput } from '@hf/contracts'
import { addTeamMember, handle, json, readMutation } from '@hf/server'
import { requireUser } from '@/lib/auth'

export const POST = handle(async (req) => {
  await requireUser(['admin'])
  const { input, idempotencyKey } = await readMutation(req, CreateTeamMemberInput)
  const { result, replayed } = await addTeamMember(input, idempotencyKey)
  return json({ user: result, replayed }, { status: replayed ? 200 : 201 })
})
