import { cookies } from 'next/headers'
import { handle, json } from '@hf/server'
import { DEV_COOKIE } from '@/lib/auth'

export const POST = handle(async () => {
  const jar = await cookies()
  jar.delete(DEV_COOKIE)
  return json({ ok: true })
})
