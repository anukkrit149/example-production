import { prisma, Prisma, type Program } from '@hf/db'
import type { CreateProgramInput, UpdateProgramInput } from '@hf/contracts'
import { emptyCounts, sumCounts, worstStatus, type StageCounts } from '@hf/domain'
import { ApiError } from '../api'
import { idempotent } from '../idempotency'
import { progressByLineItem, progressOf, type Progress } from '../progress'
import { isoDate } from './orders'

type Db = Prisma.TransactionClient | typeof prisma

async function requireOrg(db: Db, id: string, type: 'buyer' | 'agent'): Promise<void> {
  const org = await db.organization.findUnique({ where: { id } })
  if (!org || !org.active || org.type !== type) {
    const what = type === 'buyer' ? 'buyer must be an active buyer organisation' : 'agent must be an active buying house'
    throw new ApiError(422, what, type === 'buyer' ? 'invalid_buyer' : 'invalid_agent')
  }
}

export async function createProgram(input: CreateProgramInput, key: string) {
  await requireOrg(prisma, input.buyerId, 'buyer')
  if (input.agentId) await requireOrg(prisma, input.agentId, 'agent')
  return idempotent({
    key,
    entity: 'program',
    run: (tx) => tx.program.create({
      data: { name: input.name, buyerId: input.buyerId, agentId: input.agentId ?? null, season: input.season ?? null },
    }),
    reload: (tx, id) => tx.program.findUnique({ where: { id } }),
  })
}

export async function updateProgram(id: string, input: UpdateProgramInput): Promise<Program> {
  const existing = await prisma.program.findUnique({ where: { id } })
  if (!existing) throw new ApiError(404, 'program not found', 'not_found')
  if (input.agentId) await requireOrg(prisma, input.agentId, 'agent')
  return prisma.program.update({ where: { id }, data: input })
}

export type ProgramRow = {
  id: string; name: string; season: string | null
  buyer: { id: string; name: string }; agent: { id: string; name: string } | null
  orderCount: number; progress: Progress
}
export type OrderRow = {
  id: string; orderNumber: string; dueDate: string | null; programId: string; programName: string
  buyerName: string; lineItemCount: number; progress: Progress
}

type OrderWithLines = { id: string; orderNumber: string; dueDate: Date | null; programId: string; lineItems: Array<{ id: string; quantity: number }> }

type ByLine = Map<string, { counts: StageCounts; replaced: number }>

function orderRow(o: OrderWithLines, programName: string, buyerName: string, byLine: ByLine, now: Date): OrderRow {
  return {
    id: o.id, orderNumber: o.orderNumber, dueDate: isoDate(o.dueDate), programId: o.programId, programName, buyerName,
    lineItemCount: o.lineItems.length, progress: progressOf(o.lineItems, byLine, o.dueDate, now),
  }
}

/** A program is the sum of its orders and as late as its latest one. */
function programRow(
  p: { id: string; name: string; season: string | null; buyer: { id: string; name: string }; agent: { id: string; name: string } | null },
  orders: OrderRow[],
): ProgramRow {
  const parts = orders.map((o) => o.progress)
  return {
    id: p.id, name: p.name, season: p.season, buyer: p.buyer, agent: p.agent, orderCount: orders.length,
    progress: {
      counts: parts.length ? sumCounts(parts.map((x) => x.counts)) : emptyCounts(),
      replaced: parts.reduce((n, x) => n + x.replaced, 0),
      ordered: parts.reduce((n, x) => n + x.ordered, 0),
      status: worstStatus(parts.map((x) => x.status)),
    },
  }
}

const programInclude = {
  buyer: { select: { id: true, name: true } },
  agent: { select: { id: true, name: true } },
  orders: { include: { lineItems: { select: { id: true, quantity: true } } }, orderBy: { orderNumber: 'asc' as const } },
}

export async function listPrograms(): Promise<ProgramRow[]> {
  const [programs, byLine] = await Promise.all([
    prisma.program.findMany({ include: programInclude, orderBy: { createdAt: 'desc' } }),
    progressByLineItem({}),
  ])
  const now = new Date()
  return programs.map((p) => programRow(p, p.orders.map((o) => orderRow(o, p.name, p.buyer.name, byLine, now))))
}

export async function getProgram(id: string): Promise<(ProgramRow & { orders: OrderRow[] }) | null> {
  const [p, byLine] = await Promise.all([prisma.program.findUnique({ where: { id }, include: programInclude }), progressByLineItem({ programId: id })])
  if (!p) return null
  const now = new Date()
  const orders = p.orders.map((o) => orderRow(o, p.name, p.buyer.name, byLine, now))
  return { ...programRow(p, orders), orders }
}
