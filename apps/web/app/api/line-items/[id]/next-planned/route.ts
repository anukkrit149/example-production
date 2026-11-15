import { prisma } from '@hf/db'
import { ApiError, handle, json } from '@hf/server'
import { requireUser } from '@/lib/auth'

/** The "activate without label" fallback: which piece the next cut set becomes. */
export const GET = handle(async (_req, ctx) => {
  await requireUser(['store'])
  const { id } = await ctx.params
  const piece = await prisma.piece.findFirst({ where: { lineItemId: id, state: 'PLANNED' }, orderBy: { serial: 'asc' }, select: { id: true } })
  if (!piece) throw new ApiError(404, 'no planned piece left on this line item', 'no_planned_piece')
  return json({ pieceId: piece.id })
})
