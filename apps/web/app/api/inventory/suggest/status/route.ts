import { handle, json, visionAvailable } from '@hf/server'
import { requireUser } from '@/lib/auth'

export const GET = handle(async () => {
  await requireUser()
  return json({ available: visionAvailable() })
})
