import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetTestDb, testPrisma } from '@hf/db/test'
import { seedAll, type SeedResult } from '@hf/db'

// Two seams: the dev cookie (through next/headers) and the Neon session
// (through our own auth-server module). Each test picks one.
const cookie = { value: '' as string }
// When `jar` is set the stub also exposes `getAll`, like the real cookie store; when null, only `get`.
const jar = { list: null as Array<{ name: string; value: string }> | null }
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (n: string) => (n === 'hf_dev_user' && cookie.value ? { value: cookie.value } : undefined),
    ...(jar.list ? { getAll: () => jar.list } : {}),
  }),
}))
const session = { email: null as string | null, name: null as string | null, calls: 0 }
vi.mock('@/lib/auth-server', () => ({
  auth: {
    getSession: async () => {
      session.calls += 1
      return { data: session.email ? { user: { email: session.email, ...(session.name ? { name: session.name } : {}) } } : null }
    },
  },
}))

const { requireUser, whoAmI, emailIdentity } = await import('@/lib/auth')

let seed: SeedResult

describe('dashboard auth', () => {
  beforeEach(async () => {
    await resetTestDb()
    seed = await seedAll(testPrisma)
    cookie.value = ''
    jar.list = null
    session.email = null
    session.name = null
    session.calls = 0
    delete process.env.NEON_AUTH_BASE_URL
    process.env.DEV_AUTH = 'true'
  })

  it('no session and no dev cookie is 401', async () => {
    await expect(requireUser()).rejects.toMatchObject({ status: 401, code: 'unauthenticated' })
  })

  it('dev cookie resolves a seeded user', async () => {
    cookie.value = seed.users.merchandiser.authIdentity
    const u = await requireUser(['merchandiser'])
    expect(u.id).toBe(seed.users.merchandiser.id)
  })

  it('dev cookie is ignored when DEV_AUTH is off', async () => {
    process.env.DEV_AUTH = 'false'
    cookie.value = seed.users.merchandiser.authIdentity
    await expect(requireUser()).rejects.toMatchObject({ status: 401 })
  })

  it('a Neon session maps by lowercased email to an active users row', async () => {
    process.env.NEON_AUTH_BASE_URL = 'https://auth.example'
    await testPrisma.user.create({ data: { name: 'Merch One', role: 'merchandiser', authIdentity: emailIdentity('merch.one@example.com') } })
    session.email = 'Merch.One@Example.com'
    const u = await requireUser(['merchandiser'])
    expect(u.name).toBe('Merch One')
  })

  it('a Neon session with no team row is 403 not_on_team, and whoAmI reports the email', async () => {
    process.env.NEON_AUTH_BASE_URL = 'https://auth.example'
    session.email = 'stranger@example.com'
    await expect(requireUser()).rejects.toMatchObject({ status: 403, code: 'not_on_team' })
    expect(await whoAmI()).toEqual({ user: null, signedInEmail: 'stranger@example.com' })
  })

  it('a deactivated team member is treated as not on the team', async () => {
    process.env.NEON_AUTH_BASE_URL = 'https://auth.example'
    await testPrisma.user.create({ data: { name: 'Gone', role: 'merchandiser', active: false, authIdentity: emailIdentity('gone@example.com') } })
    session.email = 'gone@example.com'
    await expect(requireUser()).rejects.toMatchObject({ status: 403, code: 'not_on_team' })
  })

  it('management is read-only: 403 forbidden on a write role', async () => {
    cookie.value = seed.users.management.authIdentity
    await expect(requireUser(['merchandiser'])).rejects.toMatchObject({ status: 403, code: 'forbidden' })
    await expect(requireUser()).resolves.toMatchObject({ role: 'management' })
  })

  it('admin passes every role check', async () => {
    cookie.value = seed.users.admin.authIdentity
    await expect(requireUser(['merchandiser'])).resolves.toMatchObject({ role: 'admin' })
  })

  /**
   * The reason devAuthEnabled() exists rather than a bare DEV_AUTH check.
   * OpenNext compiles the untracked .env (DEV_AUTH=true) into the deployed
   * Worker, so on Workers the flag says yes even though nobody chose it. workerd
   * advertises itself through navigator.userAgent, and that is what closes the
   * door: a perfectly valid admin dev cookie must still be refused there.
   */
  it('the dev door does not exist on Workers, whatever DEV_AUTH says', async () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
    Object.defineProperty(globalThis, 'navigator', {
      value: { userAgent: 'Cloudflare-Workers' },
      configurable: true,
      writable: true,
    })
    try {
      process.env.DEV_AUTH = 'true'
      cookie.value = seed.users.admin.authIdentity
      await expect(requireUser()).rejects.toMatchObject({ status: 401, code: 'unauthenticated' })
    } finally {
      if (original) Object.defineProperty(globalThis, 'navigator', original)
      else delete (globalThis as { navigator?: unknown }).navigator
    }
  })

  describe('company domain is admin by default', () => {
    beforeEach(() => { process.env.NEON_AUTH_BASE_URL = 'https://auth.example' })

    it('first sign-in with an @factory.example address creates an active admin row', async () => {
      session.email = 'Sample.Admin@factory.example'
      session.name = 'Sample Admin'
      const u = await requireUser(['merchandiser'])
      expect(u).toMatchObject({ role: 'admin', active: true, name: 'Sample Admin', authIdentity: 'email:sample.admin@factory.example' })
      expect(await testPrisma.user.count({ where: { authIdentity: 'email:sample.admin@factory.example' } })).toBe(1)
    })

    it('a second sign-in reuses the row rather than creating another', async () => {
      session.email = 'sample.admin@factory.example'
      const first = await requireUser()
      const second = await requireUser()
      expect(second.id).toBe(first.id)
      expect(await testPrisma.user.count({ where: { authIdentity: 'email:sample.admin@factory.example' } })).toBe(1)
    })

    it('falls back to the local part when the session carries no name', async () => {
      session.email = 'ops@factory.example'
      expect((await requireUser()).name).toBe('ops')
    })

    it('a company user an admin has deactivated stays out and is not re-created', async () => {
      await testPrisma.user.create({ data: { name: 'Gone', role: 'admin', active: false, authIdentity: emailIdentity('gone@factory.example') } })
      session.email = 'gone@factory.example'
      await expect(requireUser()).rejects.toMatchObject({ status: 403, code: 'not_on_team' })
      expect(await testPrisma.user.count({ where: { authIdentity: 'email:gone@factory.example' } })).toBe(1)
    })

    it('a company user whose role was lowered keeps the lowered role', async () => {
      await testPrisma.user.create({ data: { name: 'Sample Lead', role: 'management', authIdentity: emailIdentity('sample.lead@factory.example') } })
      session.email = 'sample.lead@factory.example'
      await expect(requireUser(['merchandiser'])).rejects.toMatchObject({ status: 403, code: 'forbidden' })
    })

    it('look-alike domains get nothing', async () => {
      session.email = 'x@factory.example.evil'
      await expect(requireUser()).rejects.toMatchObject({ status: 403, code: 'not_on_team' })
      expect(await testPrisma.user.count({ where: { authIdentity: { startsWith: 'email:x@' } } })).toBe(0)
    })
  })

  it('skips the Neon round trip when the request has no Neon session cookie', async () => {
    process.env.NEON_AUTH_BASE_URL = 'https://neon.example'
    session.email = 'merch@example.com'
    jar.list = [{ name: 'hf_dev_user', value: '' }]
    expect((await whoAmI()).signedInEmail).toBeNull()
    expect(session.calls).toBe(0)
  })

  it('asks Neon when a session_token cookie is present', async () => {
    process.env.NEON_AUTH_BASE_URL = 'https://neon.example'
    session.email = 'merch@example.com'
    jar.list = [{ name: '__Secure-neon-auth.session_token', value: 'tok' }]
    expect((await whoAmI()).signedInEmail).toBe('merch@example.com')
    expect(session.calls).toBe(1)
  })

  it('a cookie store without getAll leaves the decision to the SDK', async () => {
    process.env.NEON_AUTH_BASE_URL = 'https://neon.example'
    session.email = 'merch@example.com'
    expect((await whoAmI()).signedInEmail).toBe('merch@example.com')
    expect(session.calls).toBe(1)
  })

})

/**
 * The rule neonAuth() applies before it constructs the SDK. Asserted against
 * lib/neon-auth-config.ts rather than lib/auth-server.ts because the latter
 * imports '@neondatabase/auth/next/server', which cannot be loaded under plain
 * Vitest (it pulls in next/headers) — the import would fail before the guard
 * ever ran. Mock-free: real env vars in, real throw out.
 */
describe('neonAuth cookie-secret guard', () => {
  afterEach(() => {
    delete process.env.NEON_AUTH_COOKIE_SECRET
  })

  it('names NEON_AUTH_COOKIE_SECRET when it is missing or too short', async () => {
    const { requireCookieSecret } = await import('@/lib/neon-auth-config')

    delete process.env.NEON_AUTH_COOKIE_SECRET
    expect(() => requireCookieSecret()).toThrow(/NEON_AUTH_COOKIE_SECRET/)

    process.env.NEON_AUTH_COOKIE_SECRET = 'too-short'
    expect(() => requireCookieSecret()).toThrow(/at least 32 characters/)

    const good = 'x'.repeat(32)
    process.env.NEON_AUTH_COOKIE_SECRET = good
    expect(requireCookieSecret()).toBe(good)
  })

})
