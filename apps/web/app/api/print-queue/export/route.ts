import { ExportQuery } from '@hf/contracts'
import { ApiError, exportLabels, handle } from '@hf/server'
import { requireUser } from '@/lib/auth'

export const POST = handle(async (req) => {
  const user = await requireUser(['store'])
  const body = await req.json().catch(() => { throw new ApiError(400, 'body must be JSON', 'bad_json') })
  const q = ExportQuery.parse(body)
  const r = await exportLabels({ kind: q.kind, stage: q.stage, format: q.format, labelIds: q.labelIds, user })
  return new Response(r.body as BodyInit, { headers: { 'content-type': r.contentType, 'content-disposition': `attachment; filename="${r.filename}"`, 'x-export-batch-id': r.batch.id } })
})
