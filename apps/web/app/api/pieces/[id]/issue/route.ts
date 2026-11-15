import { IssueInput } from '@hf/contracts'
import { handle, json, readMutation, runPieceAction, loadPieceView } from '@hf/server'
import { requireUser } from '@/lib/auth'
import { gate } from '@/lib/checklist-gate'

/**
 * Handing the piece to a worker. `afterWorker` is what puts custody on the
 * piece row, so the next scan shows who is holding it. Materials come off
 * the checklist's materials item when the stage has one (the gate already
 * refused an empty list there); otherwise they come from the request body.
 */
export const POST = handle(async (req, ctx) => {
  const user = await requireUser(['store'])
  const { id } = await ctx.params
  const { input, idempotencyKey } = await readMutation(req, IssueInput)

  const g = await gate(id, 'issue', input.stage, input.checklist)
  const fromChecklist = g.checklist.answers.find((a) => a.kind === 'materials')?.materials

  const r = await runPieceAction({
    pieceId: id,
    user,
    idempotencyKey,
    expectedVersion: input.expectedVersion,
    event: { type: 'ISSUED', stage: input.stage },
    workerId: input.workerId,
    afterWorker: input.workerId,
    groupId: input.groupId ?? null,
    details: { materials: fromChecklist ?? input.materials, ...g },
    attachmentIds: input.attachmentIds,
  })

  return json({ piece: await loadPieceView({ id }), replayed: r.replayed })
})
