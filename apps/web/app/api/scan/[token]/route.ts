import { handle, json, loadPieceView } from '@hf/server'
import { requireUser } from '@/lib/auth'

/**
 * The entry point for every checkpoint. One scan, one round trip, and the
 * phone knows what it may do next.
 */
export const GET = handle(async (_req, ctx) => {
  await requireUser()
  const { token } = await ctx.params
  const view = await loadPieceView({ qrToken: token })
  if (!view) return json({ error: { code: 'unknown_token', message: 'no piece has this code' } }, { status: 404 })
  return json(view)
})
