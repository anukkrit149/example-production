import { z } from 'zod'
import { prisma } from '@hf/db'
import { handle, json } from '@hf/server'
import { requireUser } from '@/lib/auth'

const Query = z.object({
  type: z.enum(['cutter', 'paster', 'tailor', 'finisher']).optional(),
})

/**
 * The people a piece can be handed to, for the issue screen's picker.
 *
 * Active only: a worker who has left the floor must not still be offered as a
 * destination, or custody lands on someone who cannot hand the piece back.
 * Ordered by name because the operator is looking for one person they already
 * have in mind, not browsing. Any signed-in user may read this — a QA checker
 * looking at a piece needs the name too.
 */
export const GET = handle(async (req) => {
  await requireUser()
  const q = Query.parse(Object.fromEntries(new URL(req.url).searchParams))

  const workers = await prisma.worker.findMany({
    where: { active: true, ...(q.type ? { type: q.type } : {}) },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, type: true },
  })

  return json({ workers })
})
