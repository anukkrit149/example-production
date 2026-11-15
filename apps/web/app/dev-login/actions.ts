'use server'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { DEV_COOKIE, devAuthEnabled } from '@/lib/auth'
export async function devLogin(formData: FormData) {
  if (!devAuthEnabled()) redirect('/')
  const identity = String(formData.get('identity'))
  const jar = await cookies()
  jar.set(DEV_COOKIE, identity, { httpOnly: true, sameSite: 'lax', path: '/' })
  redirect('/home')
}
