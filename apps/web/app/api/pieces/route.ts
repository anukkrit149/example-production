import { z } from 'zod'
import { handle, json, listFloorPieces, type FloorGroup } from '@hf/server'
import { requireUser } from '@/lib/auth'

const GROUPS = ['all', 'cutting', 'pasting', 'stitching', 'finishing', 'qc', 'packed', 'on_hold'] as const satisfies readonly FloorGroup[]

const Query = z.object({
  group: z.enum(GROUPS).default('all'),
  q: z.string().optional(),
  before: z.string().optional(),
})

/**
 * Pieces Status's one read: every active piece, newest activity first, for
 * the phone's stage chips, search box and Load more. Any signed-in user may
 * read it — this screen has never been role-gated, unlike the write routes
 * hold and release live on.
 *
 * `limit` is fixed at 100 rather than accepted from the query string: this is
 * a phone list with one page size, not a tunable API.
 */
export const GET = handle(async (req) => {
  await requireUser()
  const url = new URL(req.url)
  const q = Query.parse(Object.fromEntries(url.searchParams))
  return json(await listFloorPieces({ group: q.group, q: q.q, before: q.before, limit: 100 }))
})
