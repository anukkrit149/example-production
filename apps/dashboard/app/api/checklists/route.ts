import { listDefaultChecklists, handle, json } from '@hf/server'
import { requireUser } from '@/lib/auth'

export const GET = handle(async () => {
  await requireUser(['admin'])
  return json({ checklists: await listDefaultChecklists() })
})
