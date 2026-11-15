'use server'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { DEV_COOKIE, devAuthEnabled } from '@/lib/auth'

export async function devLogin(formData: FormData) {
  if (!devAuthEnabled()) redirect('/')
  const jar = await cookies()
  jar.set(DEV_COOKIE, String(formData.get('identity')), { httpOnly: true, sameSite: 'lax', path: '/' })
  redirect('/overview')
}
