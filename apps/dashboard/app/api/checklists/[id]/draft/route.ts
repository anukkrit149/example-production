import { ChecklistDraftInput } from '@hf/contracts'
import { handle, json, readJson, saveDraft } from '@hf/server'
import { requireUser } from '@/lib/auth'

/** Saving a draft is idempotent by nature: no Idempotency-Key needed. */
export const PUT = handle(async (req, ctx) => {
  await requireUser(['admin'])
  const { id } = await ctx.params
  const input = ChecklistDraftInput.parse(await readJson(req))
  return json({ checklist: await saveDraft(id, input) })
})
