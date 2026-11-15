import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { resetTestDb, testPrisma } from '@hf/db/test'
import { seedAll, type SeedResult } from '@hf/db'

/**
 * The cookie jar the whole app shares in this suite.
 *
 * Next's `cookies()` is a per-request store; here one mutable object stands in
 * for the phone. Routes set into it, `getCurrentUser` reads back out of it, so
 * a test can sign in through the real route and then assert on the real auth
 * module rather than on a mock of either.
 */
const jar = new Map<string, string>()

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (n: string) => (jar.has(n) ? { value: jar.get(n)! } : undefined),
    set: (a: unknown, b?: string) => {
      if (typeof a === 'string') jar.set(a, String(b))
      else {
        const o = a as { name: string; value: string }
        jar.set(o.name, o.value)
      }
    },
    delete: (n: string) => { jar.delete(n) },
  }),
}))

const { getCurrentUser } = await import('@/lib/auth')
const { SESSION_COOKIE, normaliseCode, hashSecret, generateCode, generateBadgeToken, badgeLimiter, __resetRateLimit } = await import('@/lib/operator-code')
const { badgeSignInUrl } = await import('@hf/domain')
const { POST: postCode } = await import('@/app/api/auth/code/route')
const { POST: postBadge } = await import('@/app/api/auth/badge/route')
const { POST: postSignout } = await import('@/app/api/auth/signout/route')
const codesRoute = await import('@/app/api/admin/operator-codes/route')
const revokeRoute = await import('@/app/api/admin/operator-codes/[id]/route')

/** Distinct IPs per test keep the in-memory rate limiter from bleeding across cases. */
let ipSeq = 0
function req(body: unknown, ip = `10.0.0.${++ipSeq}`) {
  return new Request('http://localhost/api/auth/code', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify(body),
  })
}

function badgeReq(body: unknown, ip = `10.0.1.${++ipSeq}`) {
  return new Request('http://localhost/api/auth/badge', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify(body),
  })
}

const ctx = (params: Record<string, string> = {}) => ({ params: Promise.resolve(params) })

let seed: SeedResult

/** Issues a code straight through the model, bypassing the admin route. */
async function issueCode(userId: string, issuedById: string, overrides: Record<string, unknown> = {}) {
  const code = generateCode()
  await testPrisma.operatorCode.create({
    data: {
      userId,
      issuedById,
      codeHash: hashSecret(normaliseCode(code)),
      last4: normaliseCode(code).slice(-4),
      ...overrides,
    },
  })
  return code
}

/** Issues a badge straight through the model, bypassing the admin route. */
async function issueBadge(userId: string, issuedById: string, overrides: Record<string, unknown> = {}) {
  const token = generateBadgeToken()
  await testPrisma.operatorCode.create({
    data: {
      userId,
      issuedById,
      kind: 'badge',
      codeHash: hashSecret(token),
      last4: token.slice(-4),
      ...overrides,
    },
  })
  return token
}

beforeEach(async () => {
  await resetTestDb()
  seed = await seedAll(testPrisma)
  jar.clear()
  __resetRateLimit()
  process.env.DEV_AUTH = 'false'
})

describe('operator code sign-in', () => {
  it('a valid code creates a session and getCurrentUser returns that user', async () => {
    const code = await issueCode(seed.users.store.id, seed.users.admin.id)

    const res = await postCode(req({ code }), ctx())
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ user: { id: seed.users.store.id, role: 'store' } })

    expect(jar.get(SESSION_COOKIE)).toBeTruthy()
    const me = await getCurrentUser()
    expect(me?.id).toBe(seed.users.store.id)
  })

  it('stores no plaintext: the code appears nowhere in the row', async () => {
    const code = await issueCode(seed.users.store.id, seed.users.admin.id)
    const normalised = normaliseCode(code)

    const row = await testPrisma.operatorCode.findFirst({ where: { userId: seed.users.store.id } })
    expect(row).toBeTruthy()

    // Every column, serialised, must not contain the secret in any form.
    const serialised = JSON.stringify(row)
    expect(serialised).not.toContain(normalised)
    expect(serialised).not.toContain(code)
    expect(serialised.toUpperCase()).not.toContain(normalised)

    // The stored value is the SHA-256, and only the last four survive in clear.
    expect(row!.codeHash).toBe(createHash('sha256').update(normalised).digest('hex'))
    expect(row!.codeHash).not.toBe(normalised)
    expect(row!.last4).toBe(normalised.slice(-4))
  })

  it('refuses a revoked code', async () => {
    const code = await issueCode(seed.users.store.id, seed.users.admin.id, { revokedAt: new Date() })
    const res = await postCode(req({ code }), ctx())
    expect(res.status).toBe(401)
    expect((await res.json()).error.code).toBe('invalid_code')
    expect(jar.get(SESSION_COOKIE)).toBeUndefined()
  })

  it('refuses an expired code', async () => {
    const code = await issueCode(seed.users.store.id, seed.users.admin.id, {
      expiresAt: new Date(Date.now() - 1000),
    })
    const res = await postCode(req({ code }), ctx())
    expect(res.status).toBe(401)
    expect((await res.json()).error.code).toBe('invalid_code')
  })

  it('refuses a code belonging to an inactive user', async () => {
    const code = await issueCode(seed.users.qa.id, seed.users.admin.id)
    await testPrisma.user.update({ where: { id: seed.users.qa.id }, data: { active: false } })
    const res = await postCode(req({ code }), ctx())
    expect(res.status).toBe(401)
  })

  it('rate limits: the 6th wrong attempt from one IP returns 429', async () => {
    const ip = '203.0.113.7'
    for (let i = 0; i < 5; i++) {
      const res = await postCode(req({ code: 'AAAA-BBBB' }, ip), ctx())
      expect(res.status).toBe(401)
    }
    const sixth = await postCode(req({ code: 'AAAA-BBBB' }, ip), ctx())
    expect(sixth.status).toBe(429)
    expect((await sixth.json()).error.code).toBe('too_many_attempts')
  })

  it('locks out even a correct code once the IP is over the limit', async () => {
    const ip = '203.0.113.8'
    const code = await issueCode(seed.users.store.id, seed.users.admin.id)
    for (let i = 0; i < 5; i++) await postCode(req({ code: 'AAAA-BBBB' }, ip), ctx())
    const res = await postCode(req({ code }, ip), ctx())
    expect(res.status).toBe(429)
  })
})

describe('operator sessions', () => {
  it('a valid session authenticates; a revoked one does not', async () => {
    const code = await issueCode(seed.users.store.id, seed.users.admin.id)
    await postCode(req({ code }), ctx())
    expect((await getCurrentUser())?.id).toBe(seed.users.store.id)

    await testPrisma.operatorSession.updateMany({ data: { revokedAt: new Date() } })
    expect(await getCurrentUser()).toBeNull()
  })

  it('an expired session does not authenticate', async () => {
    const code = await issueCode(seed.users.store.id, seed.users.admin.id)
    await postCode(req({ code }), ctx())

    await testPrisma.operatorSession.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } })
    expect(await getCurrentUser()).toBeNull()
  })

  it('a session for a user deactivated after sign-in stops authenticating', async () => {
    const code = await issueCode(seed.users.store.id, seed.users.admin.id)
    await postCode(req({ code }), ctx())
    await testPrisma.user.update({ where: { id: seed.users.store.id }, data: { active: false } })
    expect(await getCurrentUser()).toBeNull()
  })

  it('signing out revokes the session and clears the cookie', async () => {
    const code = await issueCode(seed.users.store.id, seed.users.admin.id)
    await postCode(req({ code }), ctx())

    const res = await postSignout(req({}), ctx())
    expect(res.status).toBe(200)
    expect(jar.get(SESSION_COOKIE)).toBeUndefined()

    const rows = await testPrisma.operatorSession.findMany()
    expect(rows).toHaveLength(1)
    expect(rows[0].revokedAt).not.toBeNull()
    expect(await getCurrentUser()).toBeNull()
  })

  it('stores no plaintext session token: the cookie value is not in the row', async () => {
    const code = await issueCode(seed.users.store.id, seed.users.admin.id)
    await postCode(req({ code }), ctx())
    const token = jar.get(SESSION_COOKIE)!
    const row = await testPrisma.operatorSession.findFirst()
    expect(JSON.stringify(row)).not.toContain(token)
    expect(row!.tokenHash).toBe(createHash('sha256').update(token).digest('hex'))
  })
})

describe('code isolation', () => {
  it('two codes hash differently and a code for A never signs in as B', async () => {
    const codeA = await issueCode(seed.users.store.id, seed.users.admin.id)
    const codeB = await issueCode(seed.users.qa.id, seed.users.admin.id)
    expect(normaliseCode(codeA)).not.toBe(normaliseCode(codeB))

    const rows = await testPrisma.operatorCode.findMany()
    expect(new Set(rows.map((r) => r.codeHash)).size).toBe(2)

    const res = await postCode(req({ code: codeA }), ctx())
    const body = await res.json()
    expect(body.user.id).toBe(seed.users.store.id)
    expect(body.user.id).not.toBe(seed.users.qa.id)

    const session = await testPrisma.operatorSession.findFirst()
    expect(session!.userId).toBe(seed.users.store.id)
  })

  it('generated codes are 8 characters from the unambiguous alphabet', () => {
    for (let i = 0; i < 50; i++) {
      const c = normaliseCode(generateCode())
      expect(c).toHaveLength(8)
      expect(c).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/)
    }
  })

  it('normalises case and separators before hashing', () => {
    expect(normaliseCode('k7m2-9qrx')).toBe('K7M29QRX')
    expect(normaliseCode(' K7M2 9QRX ')).toBe('K7M29QRX')
  })
})

describe('admin operator-code routes', () => {
  /** Signs the shared jar in as the given seeded user via a real code. */
  async function signInAs(userId: string) {
    const code = await issueCode(userId, seed.users.admin.id)
    const res = await postCode(req({ code }), ctx())
    expect(res.status).toBe(200)
  }

  it('issuing returns the plaintext exactly once and listing never exposes it', async () => {
    await signInAs(seed.users.admin.id)

    const res = await codesRoute.POST(
      new Request('http://localhost/api/admin/operator-codes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId: seed.users.store.id }),
      }),
      ctx(),
    )
    expect(res.status).toBe(200)
    const issued = await res.json()
    expect(issued.code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/)

    const plaintext = normaliseCode(issued.code)

    // It hashed to a row that does not contain it.
    const row = await testPrisma.operatorCode.findUnique({ where: { id: issued.id } })
    expect(row!.userId).toBe(seed.users.store.id)
    expect(JSON.stringify(row)).not.toContain(plaintext)

    // And the listing hands back neither the code nor its hash.
    const list = await codesRoute.GET(new Request('http://localhost/api/admin/operator-codes'), ctx())
    const body = await list.json()
    const text = JSON.stringify(body)
    expect(text).not.toContain(plaintext)
    expect(text).not.toContain(row!.codeHash)
    expect(body.codes.some((c: { id: string }) => c.id === issued.id)).toBe(true)
    expect(body.codes[0]).toHaveProperty('last4')
  })

  it('revoking through the route stops the code working', async () => {
    await signInAs(seed.users.admin.id)
    const res = await codesRoute.POST(
      new Request('http://localhost/api/admin/operator-codes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId: seed.users.store.id }),
      }),
      ctx(),
    )
    const issued = await res.json()

    const del = await revokeRoute.DELETE(
      new Request(`http://localhost/api/admin/operator-codes/${issued.id}`, { method: 'DELETE' }),
      ctx({ id: issued.id }),
    )
    expect(del.status).toBe(200)

    jar.clear()
    const attempt = await postCode(req({ code: issued.code }), ctx())
    expect(attempt.status).toBe(401)
  })

  it('a non-admin gets 403 from every admin route', async () => {
    await signInAs(seed.users.store.id)

    const post = await codesRoute.POST(
      new Request('http://localhost/api/admin/operator-codes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId: seed.users.qa.id }),
      }),
      ctx(),
    )
    expect(post.status).toBe(403)

    const get = await codesRoute.GET(new Request('http://localhost/api/admin/operator-codes'), ctx())
    expect(get.status).toBe(403)

    const del = await revokeRoute.DELETE(
      new Request('http://localhost/api/admin/operator-codes/x', { method: 'DELETE' }),
      ctx({ id: '00000000-0000-0000-0000-000000000000' }),
    )
    expect(del.status).toBe(403)

    // Nothing was created by the refused POST.
    expect(await testPrisma.operatorCode.count({ where: { userId: seed.users.qa.id } })).toBe(0)
  })

  it('an anonymous caller gets 401 from the admin routes', async () => {
    jar.clear()
    const get = await codesRoute.GET(new Request('http://localhost/api/admin/operator-codes'), ctx())
    expect(get.status).toBe(401)
  })
})

describe('badge (ID card) sign-in', () => {
  it('a valid badge creates a session and getCurrentUser returns that user', async () => {
    const token = await issueBadge(seed.users.store.id, seed.users.admin.id)

    const res = await postBadge(badgeReq({ token }), ctx())
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ user: { id: seed.users.store.id, role: 'store' } })

    expect(jar.get(SESSION_COOKIE)).toBeTruthy()
    expect((await getCurrentUser())?.id).toBe(seed.users.store.id)
  })

  it('accepts the token however the camera hands it over', async () => {
    const token = await issueBadge(seed.users.store.id, seed.users.admin.id)
    for (const variant of [token.toLowerCase(), ` ${token} `, token.replace(/-/g, '')]) {
      jar.clear()
      const res = await postBadge(badgeReq({ token: variant }), ctx())
      expect(res.status).toBe(200)
      expect((await getCurrentUser())?.id).toBe(seed.users.store.id)
    }
  })

  it('stores no plaintext: the token appears nowhere in the row', async () => {
    const token = await issueBadge(seed.users.store.id, seed.users.admin.id)
    const row = await testPrisma.operatorCode.findFirst({ where: { kind: 'badge' } })

    expect(JSON.stringify(row)).not.toContain(token)
    expect(row!.codeHash).toBe(createHash('sha256').update(token).digest('hex'))
    expect(row!.last4).toBe(token.slice(-4))
  })

  it('marks the badge used, so an admin can see which cards are in circulation', async () => {
    const token = await issueBadge(seed.users.store.id, seed.users.admin.id)
    await postBadge(badgeReq({ token }), ctx())

    const row = await testPrisma.operatorCode.findFirst({ where: { kind: 'badge' } })
    expect(row!.lastUsedAt).not.toBeNull()
  })

  it('refuses a revoked, an expired, and a deactivated operator\'s badge alike', async () => {
    const revoked = await issueBadge(seed.users.store.id, seed.users.admin.id, { revokedAt: new Date() })
    const expired = await issueBadge(seed.users.store.id, seed.users.admin.id, {
      expiresAt: new Date(Date.now() - 1000),
    })
    const deactivated = await issueBadge(seed.users.qa.id, seed.users.admin.id)
    await testPrisma.user.update({ where: { id: seed.users.qa.id }, data: { active: false } })

    for (const token of [revoked, expired, deactivated, 'HF-W-' + 'A'.repeat(24), 'not-a-badge']) {
      const res = await postBadge(badgeReq({ token }), ctx())
      expect(res.status).toBe(401)
      // Every refusal is the same refusal: nothing here may tell a caller which
      // guesses are worth repeating, or which operators exist.
      expect((await res.json()).error.code).toBe('invalid_badge')
      expect(jar.get(SESSION_COOKIE)).toBeUndefined()
    }
  })

  it('revoking the card through the admin route stops it working', async () => {
    const token = await issueBadge(seed.users.store.id, seed.users.admin.id)
    const row = await testPrisma.operatorCode.findFirstOrThrow({ where: { kind: 'badge' } })

    // Revoke as an admin, then come back as an empty phone.
    const adminCode = await issueCode(seed.users.admin.id, seed.users.admin.id)
    await postCode(req({ code: adminCode }), ctx())
    const del = await revokeRoute.DELETE(
      new Request(`http://localhost/api/admin/operator-codes/${row.id}`, { method: 'DELETE' }),
      ctx({ id: row.id }),
    )
    expect(del.status).toBe(200)

    jar.clear()
    expect((await postBadge(badgeReq({ token }), ctx())).status).toBe(401)
  })

  it('a card scanned on a phone someone else is holding takes it over, and ends their session', async () => {
    const storeCode = await issueCode(seed.users.store.id, seed.users.admin.id)
    await postCode(req({ code: storeCode }), ctx())
    const firstToken = jar.get(SESSION_COOKIE)!
    expect((await getCurrentUser())?.id).toBe(seed.users.store.id)

    const badge = await issueBadge(seed.users.qa.id, seed.users.admin.id)
    expect((await postBadge(badgeReq({ token: badge }), ctx())).status).toBe(200)

    expect((await getCurrentUser())?.id).toBe(seed.users.qa.id)
    // The handed-over session is revoked, not merely forgotten by the cookie
    // jar: a token copied off that phone must not still work.
    const previous = await testPrisma.operatorSession.findUnique({
      where: { tokenHash: hashSecret(firstToken) },
    })
    expect(previous!.revokedAt).not.toBeNull()
  })

  it('the two doors do not accept each other\'s secrets', async () => {
    const code = await issueCode(seed.users.store.id, seed.users.admin.id)
    const badge = await issueBadge(seed.users.store.id, seed.users.admin.id)

    expect((await postBadge(badgeReq({ token: code }), ctx())).status).toBe(401)
    expect((await postCode(req({ code: badge }), ctx())).status).toBe(401)
    expect(jar.get(SESSION_COOKIE)).toBeUndefined()
  })

  it('a code lockout does not lock the ID cards out with it', async () => {
    const ip = '203.0.113.20'
    const badge = await issueBadge(seed.users.store.id, seed.users.admin.id)

    for (let i = 0; i < 5; i++) await postCode(req({ code: 'AAAA-BBBB' }, ip), ctx())
    expect((await postCode(req({ code: 'AAAA-BBBB' }, ip), ctx())).status).toBe(429)

    // The whole factory is behind one IP. A handful of mistyped codes must not
    // take every card on the floor down with them.
    expect((await postBadge(badgeReq({ token: badge }, ip), ctx())).status).toBe(200)
  })

  it('rate limits its own bucket once a card is hammered', async () => {
    const ip = '203.0.113.21'
    const badge = await issueBadge(seed.users.store.id, seed.users.admin.id)

    for (let i = 0; i < badgeLimiter.max; i++) {
      expect((await postBadge(badgeReq({ token: 'HF-W-' + 'A'.repeat(24) }, ip), ctx())).status).toBe(401)
    }

    const blocked = await postBadge(badgeReq({ token: badge }, ip), ctx())
    expect(blocked.status).toBe(429)
    expect((await blocked.json()).error.code).toBe('too_many_attempts')
  })
})

describe('admin badge issue', () => {
  async function signInAdmin() {
    const code = await issueCode(seed.users.admin.id, seed.users.admin.id)
    expect((await postCode(req({ code }), ctx())).status).toBe(200)
  }

  async function issueThrough(kind: 'code' | 'badge') {
    return codesRoute.POST(
      new Request('http://localhost/api/admin/operator-codes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId: seed.users.store.id, kind }),
      }),
      ctx(),
    )
  }

  it('hands back a printable token once, and it signs its owner in', async () => {
    await signInAdmin()
    const body = await (await issueThrough('badge')).json()

    expect(body.kind).toBe('badge')
    expect(body.code).toMatch(/^HF-W-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{24}$/)

    // The row keeps only the hash, and the listing exposes neither.
    const row = await testPrisma.operatorCode.findUniqueOrThrow({ where: { id: body.id } })
    expect(JSON.stringify(row)).not.toContain(body.code)

    const list = await codesRoute.GET(new Request('http://localhost/api/admin/operator-codes'), ctx())
    const listed = await list.json()
    expect(JSON.stringify(listed)).not.toContain(body.code)
    expect(JSON.stringify(listed)).not.toContain(row.codeHash)
    expect(listed.codes.find((c: { id: string }) => c.id === body.id).kind).toBe('badge')

    jar.clear()
    expect((await postBadge(badgeReq({ token: body.code }), ctx())).status).toBe(200)
    expect((await getCurrentUser())?.id).toBe(seed.users.store.id)
  })

  it('still issues a typed code when no kind is asked for', async () => {
    await signInAdmin()
    const res = await codesRoute.POST(
      new Request('http://localhost/api/admin/operator-codes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId: seed.users.store.id }),
      }),
      ctx(),
    )
    const body = await res.json()
    expect(body.kind).toBe('code')
    expect(body.code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/)
  })

  it('a non-admin cannot issue a card', async () => {
    const code = await issueCode(seed.users.store.id, seed.users.admin.id)
    await postCode(req({ code }), ctx())

    expect((await issueThrough('badge')).status).toBe(403)
    expect(await testPrisma.operatorCode.count({ where: { kind: 'badge' } })).toBe(0)
  })
})

describe('sign-in is not driveable from another site', () => {
  /** A cross-site POST, shaped the only way a plain HTML form can shape one. */
  function formPost(path: string, body: unknown) {
    return new Request(`http://localhost${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'text/plain',
        origin: 'https://evil.example',
        host: 'localhost',
        'x-forwarded-for': `10.0.9.${++ipSeq}`,
      },
      body: JSON.stringify(body),
    })
  }

  it('a form post from another origin cannot mint a session on either door', async () => {
    const code = await issueCode(seed.users.store.id, seed.users.admin.id)
    const badge = await issueBadge(seed.users.store.id, seed.users.admin.id)

    // 415 before anything else: `Request.json()` never looks at the content
    // type, so without this a form is a perfectly good way to post JSON.
    const asCode = await postCode(formPost('/api/auth/code', { code }), ctx())
    expect(asCode.status).toBe(415)

    const asBadge = await postBadge(formPost('/api/auth/badge', { token: badge }), ctx())
    expect(asBadge.status).toBe(415)

    expect(jar.get(SESSION_COOKIE)).toBeUndefined()
    expect(await testPrisma.operatorSession.count()).toBe(0)
  })

  it('a JSON post from another origin is refused too', async () => {
    const badge = await issueBadge(seed.users.store.id, seed.users.admin.id)
    const res = await postBadge(
      new Request('http://localhost/api/auth/badge', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'https://evil.example',
          host: 'localhost',
          'x-forwarded-for': `10.0.9.${++ipSeq}`,
        },
        body: JSON.stringify({ token: badge }),
      }),
      ctx(),
    )
    expect(res.status).toBe(403)
    expect(jar.get(SESSION_COOKIE)).toBeUndefined()
  })

  it('and a cross-site attempt cannot end a session that is already signed in', async () => {
    const code = await issueCode(seed.users.store.id, seed.users.admin.id)
    await postCode(req({ code }), ctx())
    const badge = await issueBadge(seed.users.qa.id, seed.users.admin.id)

    // The badge route revokes whatever session the phone was carrying, so a
    // refusal here has to happen before any write, not merely before the cookie.
    await postBadge(formPost('/api/auth/badge', { token: badge }), ctx())

    expect((await getCurrentUser())?.id).toBe(seed.users.store.id)
    const live = await testPrisma.operatorSession.findMany({ where: { revokedAt: null } })
    expect(live).toHaveLength(1)
  })
})

describe('badge sign-in URL', () => {
  it('carries the token in the fragment, so no server ever sees it', () => {
    const token = generateBadgeToken()
    const url = new URL(badgeSignInUrl('https://hf.example.com', token))

    // What a request for this URL actually sends: a path with nothing in it.
    expect(url.pathname).toBe('/badge')
    expect(url.search).toBe('')
    expect(`${url.pathname}${url.search}`).not.toContain(token)
    expect(url.hash).toBe(`#${token}`)
  })
})
