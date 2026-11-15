import { z } from 'zod'
import { LabelKindSchema, StageSchema } from '@hf/contracts'
import { handle, json, listLabels } from '@hf/server'
import { requireUser } from '@/lib/auth'

const Query = z.object({
  kind: LabelKindSchema.default('stage'),
  stage: StageSchema.optional(),
  status: z.enum(['pending', 'printed']).default('pending'),
})

export const GET = handle(async (req) => {
  await requireUser(['store', 'supervisor', 'admin'])
  const url = new URL(req.url)
  const q = Query.parse(Object.fromEntries(url.searchParams))
  return json({ labels: await listLabels(q) })
})
