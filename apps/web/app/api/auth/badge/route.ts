import { z } from 'zod'
import { prisma } from '@hf/db'
import { normalizeBadgeToken } from '@hf/domain'
import { ApiError, handle, json } from '@hf/server'
import { badgeLimiter, clientIp, hashSecret, isLive, safeEqualHex } from '@/lib/operator-code'
import { requireSameOrigin } from '@/lib/same-origin'
import { startOperatorSession } from '@/lib/operator-session'

const Body = z.object({
  token: z.string().min(1).max(120),
  deviceLabel: z.string().trim().min(1).max(80).optional(),
})

/**
 * Badge sign-in: the ID card is the credential.
 *
 * The operator points the phone's camera at the QR on their card, the camera
 * opens `/badge#<token>`, and that screen posts here. Nothing is typed and
 * nothing is chosen — which is the entire point, because the people this app
 * is for cannot reliably type an eight-character code, and a sign-in they
 * cannot complete is a sign-in that gets shared.
 *
 * The token reaches this route in a POST body and nowhere else. It rides to
 * the browser in the URL's fragment, which is never sent to a server, so it
 * appears in no access log on the way in; and the state change never rides on a
 * bare GET, so a prefetch or a link preview fetches a page and nothing more.
 * The screen posts by itself, with no tap — that is the point of a card — so
 * what stands between this route and another site driving it is
 * `requireSameOrigin`, not a gesture.
 *
 * Refusals are as uniform as the code screen's, and for the same reason: a
 * caller must not be able to tell "no such badge" from "revoked" from "expired"
 * from "that operator was deactivated". What differs is the wording, because
 * the person reading it is holding a card, not a slip.
 */
export const POST = handle(async (req) => {
  requireSameOrigin(req)
  const ip = clientIp(req)

  if (badgeLimiter.isRateLimited(ip)) {
    throw new ApiError(
      429,
      `Too many card scans. Wait ${Math.ceil(badgeLimiter.retryAfterSeconds(ip) / 60)} minutes, or ask a supervisor.`,
      'too_many_attempts',
    )
  }

  const body = await req.json().catch(() => {
    throw new ApiError(400, 'body must be JSON', 'bad_json')
  })
  const { token, deviceLabel } = Body.parse(body)

  const normalised = normalizeBadgeToken(token)

  const candidate = normalised
    ? await prisma.operatorCode.findUnique({
        where: { codeHash: hashSecret(normalised) },
        include: { user: true },
      })
    : null

  const ok =
    normalised !== null &&
    candidate !== null &&
    candidate.kind === 'badge' &&
    safeEqualHex(hashSecret(normalised), candidate.codeHash) &&
    isLive(candidate) &&
    candidate.user.active

  if (!ok) {
    badgeLimiter.recordFailure(ip)
    throw new ApiError(
      401,
      'This card did not work. Ask your supervisor for a new one.',
      'invalid_badge',
    )
  }

  // `replaceExisting` because a bench phone changes hands: whoever scans their
  // card is taking the phone over, and the session it was carrying should end
  // there rather than outlive the handover by thirty days.
  await startOperatorSession({
    userId: candidate.userId,
    credentialId: candidate.id,
    deviceLabel,
    replaceExisting: true,
  })

  badgeLimiter.clearFailures(ip)

  return json({ user: { id: candidate.user.id, name: candidate.user.name, role: candidate.user.role } })
})

