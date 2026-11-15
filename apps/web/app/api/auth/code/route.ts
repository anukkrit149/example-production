import { z } from 'zod'
import { prisma } from '@hf/db'
import { ApiError, handle, json } from '@hf/server'
import {
  clearFailures,
  clientIp,
  hashSecret,
  isLive,
  isRateLimited,
  normaliseCode,
  recordFailure,
  retryAfterSeconds,
  safeEqualHex,
} from '@/lib/operator-code'
import { startOperatorSession } from '@/lib/operator-session'
import { requireSameOrigin } from '@/lib/same-origin'

const Body = z.object({
  code: z.string().min(1).max(64),
  deviceLabel: z.string().trim().min(1).max(80).optional(),
})

/**
 * Operator sign-in. One code, once, and the phone stays in for a month.
 *
 * Order matters: the rate limit is checked BEFORE the code is looked up, so a
 * locked-out IP cannot use response timing or a lucky guess to learn anything —
 * even a correct code is refused while the lockout stands.
 *
 * Every failure returns the same 401 `invalid_code` with the same wording. A
 * caller must not be able to distinguish "no such code" from "revoked" from
 * "expired" from "that operator was deactivated"; each distinction would tell
 * an attacker which guesses are worth repeating, and would leak staffing
 * information to anyone with a browser.
 */
export const POST = handle(async (req) => {
  // Same guard as the badge route: this one mints a session cookie too, and
  // `SameSite=Lax` does not stop another site from asking for one.
  requireSameOrigin(req)
  const ip = clientIp(req)

  if (isRateLimited(ip)) {
    throw new ApiError(
      429,
      `Too many wrong codes. Wait ${Math.ceil(retryAfterSeconds(ip) / 60)} minutes and try again, or ask a supervisor.`,
      'too_many_attempts',
    )
  }

  const body = await req.json().catch(() => {
    throw new ApiError(400, 'body must be JSON', 'bad_json')
  })
  const { code, deviceLabel } = Body.parse(body)

  const normalised = normaliseCode(code)

  const candidate = normalised
    ? await prisma.operatorCode.findUnique({
        where: { codeHash: hashSecret(normalised) },
        include: { user: true },
      })
    : null

  // Constant-time confirmation of the hash we just matched on. The unique-index
  // lookup already did the work, but comparing here too means the one place a
  // supplied secret meets a stored one is timing-safe, as required — and it
  // keeps that guarantee if the lookup is ever loosened to a scan.
  //
  // `kind` is checked as well: this screen signs in typed codes only. A badge
  // token cannot reach here anyway — `normaliseCode` strips its hyphens into a
  // 29-character string that hashes to nothing — but the two secrets now share
  // a table, and "which door is this credential for" belongs in the predicate
  // rather than in an argument about hash spaces.
  const ok =
    candidate !== null &&
    candidate.kind === 'code' &&
    safeEqualHex(hashSecret(normalised), candidate.codeHash) &&
    isLive(candidate) &&
    candidate.user.active

  if (!ok) {
    recordFailure(ip)
    throw new ApiError(401, 'That code was not recognised. Check it and try again.', 'invalid_code')
  }

  await startOperatorSession({ userId: candidate.userId, credentialId: candidate.id, deviceLabel })

  clearFailures(ip)

  return json({ user: { id: candidate.user.id, name: candidate.user.name, role: candidate.user.role } })
})
