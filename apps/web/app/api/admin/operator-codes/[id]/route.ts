import { prisma } from '@hf/db'
import { ApiError, handle, json } from '@hf/server'
import { requireUser } from '@/lib/auth'

/**
 * Revoke a credential, and with it every phone signed in on its owner.
 *
 * A lost slip of paper — or, now, an ID card left in a taxi — is the threat
 * this answers, and revoking only the credential would leave the phone that
 * already used it signed in for the rest of the 30 days, which is exactly the
 * device you are worried about. So this also revokes the user's live sessions.
 *
 * That is a blunt instrument by design: it signs the operator out of their own
 * bench phone too, and they will need a fresh code. On a factory floor, "that
 * code is gone and so is anything it opened" is the behaviour an admin expects
 * when they tap Revoke.
 *
 * Rows are marked, never deleted — who issued what to whom and when is audit
 * material, and a dispute six months out needs it.
 */
export const DELETE = handle(async (_req, ctx) => {
  await requireUser(['admin'])
  const { id } = await ctx.params

  const code = await prisma.operatorCode.findUnique({ where: { id } })
  if (!code) throw new ApiError(404, 'credential not found', 'not_found')

  const now = new Date()
  if (!code.revokedAt) {
    await prisma.$transaction([
      prisma.operatorCode.update({ where: { id }, data: { revokedAt: now } }),
      prisma.operatorSession.updateMany({
        where: { userId: code.userId, revokedAt: null },
        data: { revokedAt: now },
      }),
    ])
  }

  return json({ id, revokedAt: code.revokedAt ?? now })
})
