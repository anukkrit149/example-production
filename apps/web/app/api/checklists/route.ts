import { ChecklistStepSchema, StageSchema } from '@hf/contracts'
import { ApiError, handle, json, resolveForPiece } from '@hf/server'
import { requireUser } from '@/lib/auth'

/** The resolved list for one piece and step, both languages, for the stepper to render. */
export const GET = handle(async (req) => {
  await requireUser()
  const url = new URL(req.url)
  const pieceId = url.searchParams.get('pieceId')
  const step = ChecklistStepSchema.safeParse(url.searchParams.get('step'))
  const stageRaw = url.searchParams.get('stage')
  const stage = stageRaw ? StageSchema.safeParse(stageRaw) : null
  if (!pieceId || !step.success || (stage && !stage.success)) throw new ApiError(400, 'pieceId, step and an optional stage are required', 'validation')
  return json({ checklist: await resolveForPiece(pieceId, step.data, stage ? stage.data : null) })
})
