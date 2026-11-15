import { getOverview, handle, json } from '@hf/server'
import { requireUser } from '@/lib/auth'

export const GET = handle(async (req) => {
  await requireUser()
  const url = new URL(req.url)
  return json(await getOverview({
    period: url.searchParams.get('period') ?? undefined,
    date: url.searchParams.get('date') ?? undefined,
  }))
})
