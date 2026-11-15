import { PackInput } from '@hf/contracts'
import { handle, json, readMutation, runPieceAction, loadPieceView } from '@hf/server'
import { requireUser } from '@/lib/auth'
import { gate } from '@/lib/checklist-gate'

export const POST = handle(async (req, ctx) => {
  const user = await requireUser(['store'])
  const { id } = await ctx.params
  const { input, idempotencyKey } = await readMutation(req, PackInput)
  const g = await gate(id, 'pack', null, input.checklist)
  const r = await runPieceAction({ pieceId: id, user, idempotencyKey, expectedVersion: input.expectedVersion, event: { type: 'PACKED' }, details: { carton: input.carton, ...g }, attachmentIds: input.attachmentIds })
  return json({ piece: await loadPieceView({ id }), replayed: r.replayed })
})
