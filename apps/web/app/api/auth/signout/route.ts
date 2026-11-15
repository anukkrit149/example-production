import { cookies } from 'next/headers'
import { prisma } from '@hf/db'
import { handle, json } from '@hf/server'
import { hashSecret, SESSION_COOKIE } from '@/lib/operator-code'

/**
 * Hand the phone back.
 *
 * The row is revoked, not deleted: an operator signing out is part of the
 * custody story, and a deleted session row would take that with it. Revoking
 * server-side is also what makes this real — clearing the cookie alone would
 * leave a token that still worked if anyone had copied it off the device.
 *
 * Always 200, even with no session. Sign-out is idempotent; a phone whose
 * cookie already expired should still end up on the sign-in screen rather than
 * being shown an error it cannot act on.
 */
export const POST = handle(async () => {
  const jar = await cookies()
  const token = jar.get(SESSION_COOKIE)?.value

  if (token) {
    await prisma.operatorSession.updateMany({
      where: { tokenHash: hashSecret(token), revokedAt: null },
      data: { revokedAt: new Date() },
    })
  }

  jar.delete(SESSION_COOKIE)
  // The dev identity goes too, so "Sign out" means signed out on a dev machine
  // rather than silently falling through to the dev cookie on the next request.
  jar.delete('hf_dev_user')

  return json({ ok: true })
})
