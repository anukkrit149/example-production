import { MarkPrintedInput } from '@hf/contracts'
import { handle, json, markBatchPrinted } from '@hf/server'
import { requireUser } from '@/lib/auth'

export const POST = handle(async (req, ctx) => {
  await requireUser(['merchandiser', 'store'])
  const { batchId } = await ctx.params
  const input = MarkPrintedInput.parse(await req.json().catch(() => ({})))
  await markBatchPrinted(batchId, input.copies)
  return json({ ok: true })
})
