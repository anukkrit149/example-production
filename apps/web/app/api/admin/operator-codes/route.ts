import { z } from 'zod'
import { prisma } from '@hf/db'
import { ApiError, handle, json } from '@hf/server'
import { requireUser } from '@/lib/auth'
import { generateBadgeToken, generateCode, hashSecret, normaliseCode } from '@/lib/operator-code'

const IssueBody = z.object({
  userId: z.uuid(),
  /**
   * Which door this credential opens. Defaults to `code` so every existing
   * caller — and the screen as it stood before ID cards existed — keeps issuing
   * exactly what it always did.
   */
  kind: z.enum(['code', 'badge']).default('code'),
  expiresInDays: z.number().int().min(1).max(365).optional(),
})

/**
 * Issue a credential to one operator: a typed code, or an ID-card badge.
 *
 * The plaintext is returned HERE AND NOWHERE ELSE, ever. Only its SHA-256 is
 * written, so this response is genuinely the single copy in existence — if the
 * admin closes the screen before writing it down, the only remedy is to issue a
 * new one and revoke this. `oneTime` and the copy on screen both say so.
 *
 * That rule is what makes the badge screen print the card immediately rather
 * than offering a reprint later: a card cannot be reprinted, because the token
 * on it is not recoverable from the database any more than a code is. A lost
 * card is revoked and reissued, which is also the behaviour you want from a
 * credential someone can drop in a car park.
 *
 * Issuing does not revoke the operator's existing credentials. That is
 * deliberate: an operator may be mid-shift on a phone signed in with the old
 * one, and silently cutting them off at the bench is worse than two live
 * credentials for the hour it takes an admin to revoke the old one on purpose.
 */
export const POST = handle(async (req) => {
  const admin = await requireUser(['admin'])
  const body = await req.json().catch(() => {
    throw new ApiError(400, 'body must be JSON', 'bad_json')
  })
  const { userId, kind, expiresInDays } = IssueBody.parse(body)

  const target = await prisma.user.findUnique({ where: { id: userId } })
  if (!target) throw new ApiError(404, 'user not found', 'not_found')
  if (!target.active) throw new ApiError(400, 'that user is not active', 'inactive_user')

  // A code is hashed in its normalised form — the form a phone keyboard will
  // produce however the operator types it. A badge is hashed as issued: it is
  // never typed, so its canonical form is simply itself, and `last4` therefore
  // falls out of the same string for both.
  const plaintext = kind === 'badge' ? generateBadgeToken() : generateCode()
  const hashed = kind === 'badge' ? plaintext : normaliseCode(plaintext)

  const row = await prisma.operatorCode.create({
    data: {
      userId: target.id,
      issuedById: admin.id,
      kind,
      codeHash: hashSecret(hashed),
      last4: hashed.slice(-4),
      expiresAt: expiresInDays ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000) : null,
    },
  })

  return json({
    id: row.id,
    kind: row.kind,
    code: plaintext,
    last4: row.last4,
    expiresAt: row.expiresAt,
    user: { id: target.id, name: target.name, role: target.role },
    oneTime:
      kind === 'badge'
        ? 'This card is shown once and cannot be printed again. Print it before closing.'
        : 'This code is shown once and cannot be retrieved again. Write it down before closing.',
  })
})

/**
 * Every credential, for the admin screen.
 *
 * The select is explicit and deliberately narrow — `codeHash` is never in it.
 * A `findMany` with no select would ship the hash to the browser, which is not
 * a secret exactly but is offline-attackable material with no reason to leave
 * the database. `last4` is all an admin needs to tell two codes apart.
 */
export const GET = handle(async () => {
  await requireUser(['admin'])

  const codes = await prisma.operatorCode.findMany({
    orderBy: [{ revokedAt: 'asc' }, { issuedAt: 'desc' }],
    select: {
      id: true,
      kind: true,
      last4: true,
      issuedAt: true,
      expiresAt: true,
      revokedAt: true,
      lastUsedAt: true,
      user: { select: { id: true, name: true, role: true, active: true } },
      issuedBy: { select: { id: true, name: true } },
    },
  })

  return json({ codes })
})
