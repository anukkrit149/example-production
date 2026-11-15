import { cookies } from 'next/headers'
import { prisma } from '@hf/db'
import { generateSessionToken, hashSecret, SESSION_COOKIE, SESSION_DAYS } from './operator-code'

/**
 * Turning a credential into a signed-in phone.
 *
 * Both front doors — the typed code and the ID-card badge — end here, so the
 * session a badge creates is in every way the session a code creates: same
 * cookie, same thirty days, same revocable row that `getCurrentUser` re-checks
 * on every request. A badge is a different way of proving who you are, not a
 * different kind of access.
 */
export async function startOperatorSession({
  userId,
  credentialId,
  deviceLabel,
  replaceExisting = false,
}: {
  userId: string
  credentialId: string
  deviceLabel?: string
  /**
   * Revoke whatever session this phone already carried.
   *
   * On the badge path this is on: a bench phone passes between people all day,
   * and the operator scanning their card is taking it over from whoever held it
   * last. Leaving the previous session live would leave a token that still
   * worked for another thirty days if anyone had copied it off the device —
   * exactly what sign-out revokes for the same reason.
   *
   * The code path leaves it off, because typing a code is how a phone is set up
   * rather than how it changes hands, and revoking there would be a behaviour
   * change to a screen that is already in the factory's hands.
   */
  replaceExisting?: boolean
}): Promise<void> {
  const jar = await cookies()
  const previous = replaceExisting ? jar.get(SESSION_COOKIE)?.value : undefined

  const token = generateSessionToken()
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000)

  // One transaction for all three writes. Revoking the outgoing session in a
  // separate round trip would leave a window where a crash — or a `P2025` from
  // the credential having been revoked concurrently — hands the phone back a
  // dead token and no replacement, signing the operator out of a bench they are
  // standing at. Either the handover happens completely or it does not happen.
  await prisma.$transaction([
    ...(previous
      ? [
          prisma.operatorSession.updateMany({
            where: { tokenHash: hashSecret(previous), revokedAt: null },
            data: { revokedAt: new Date() },
          }),
        ]
      : []),
    prisma.operatorSession.create({
      data: { userId, tokenHash: hashSecret(token), deviceLabel, expiresAt },
    }),
    prisma.operatorCode.update({ where: { id: credentialId }, data: { lastUsedAt: new Date() } }),
  ])

  // Only once the row exists. A cookie set before the write would authenticate
  // nobody if the write then failed, and the phone would sit on a sign-in loop
  // it could not explain.
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  })
}
