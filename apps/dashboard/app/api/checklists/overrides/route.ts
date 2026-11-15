import { CreateOverrideInput } from '@hf/contracts'
import { createOverride, handle, json, readJson } from '@hf/server'
import { requireUser } from '@/lib/auth'

export const POST = handle(async (req) => {
  await requireUser(['admin'])
  const input = CreateOverrideInput.parse(await readJson(req))
  return json({ checklist: await createOverride(input) })
})
