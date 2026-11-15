import { CreateOrganizationInput } from '@hf/contracts'
import { createOrganization, handle, json, readMutation } from '@hf/server'
import { requireUser } from '@/lib/auth'

export const POST = handle(async (req) => {
  await requireUser(['merchandiser'])
  const { input, idempotencyKey } = await readMutation(req, CreateOrganizationInput)
  const { result, replayed } = await createOrganization(input, idempotencyKey)
  return json({ organization: result, replayed }, { status: replayed ? 200 : 201 })
})
