import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resetTestDb, testPrisma } from '@hf/db/test'
import { seedAll } from '@hf/db'

vi.mock('next/headers', () => {
  const store = { value: '' }
  return {
    cookies: async () => ({ get: (n: string) => (n === 'hf_dev_user' && store.value ? { value: store.value } : undefined) }),
    __setCookie: (v: string) => { store.value = v },
  }
})
const headers = await import('next/headers') as unknown as { __setCookie: (v: string) => void }
const { getCurrentUser, requireUser, ApiError } = await import('@/lib/auth')

describe('dev auth', () => {
  beforeEach(async () => { await resetTestDb(); await seedAll(testPrisma); process.env.DEV_AUTH = 'true' })
  it('resolves the user from the dev cookie', async () => {
    headers.__setCookie('dev:store')
    expect((await getCurrentUser())?.role).toBe('store')
  })
  it('returns null without a cookie', async () => {
    headers.__setCookie('')
    expect(await getCurrentUser()).toBeNull()
  })
  it('requireUser enforces roles', async () => {
    headers.__setCookie('dev:store')
    await expect(requireUser(['qa'])).rejects.toBeInstanceOf(ApiError)
    await expect(requireUser(['store', 'qa'])).resolves.toMatchObject({ role: 'store' })
  })
})
