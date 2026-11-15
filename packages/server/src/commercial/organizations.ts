import { prisma, type Organization } from '@hf/db'
import type { CreateOrganizationInput, UpdateOrganizationInput } from '@hf/contracts'
import { ApiError } from '../api'
import { idempotent } from '../idempotency'

export type OrganizationRow = {
  id: string
  type: 'buyer' | 'agent'
  name: string
  active: boolean
  createdAt: string
  buyerPrograms: number
  agentPrograms: number
}

/** Active first, then buyers before agents, then by name — the order the screen shows. */
export async function listOrganizations(): Promise<OrganizationRow[]> {
  const rows = await prisma.organization.findMany({
    orderBy: [{ active: 'desc' }, { type: 'asc' }, { name: 'asc' }],
    include: { _count: { select: { buyerPrograms: true, agentPrograms: true } } },
  })
  return rows.map((o) => ({
    id: o.id, type: o.type, name: o.name, active: o.active, createdAt: o.createdAt.toISOString(),
    buyerPrograms: o._count.buyerPrograms, agentPrograms: o._count.agentPrograms,
  }))
}

/**
 * Names are unique ignoring case. The schema does not enforce it, but two
 * buyers both called "Nordheim GmbH" would put programs under the wrong one
 * with nothing on screen to tell them apart, so the check lives here and the
 * 409 reads like the other conflicts.
 */
export function createOrganization(input: CreateOrganizationInput, key: string) {
  return idempotent({
    key,
    entity: 'organization',
    run: async (tx) => {
      const taken = await tx.organization.findFirst({ where: { name: { equals: input.name, mode: 'insensitive' } } })
      if (taken) throw new ApiError(409, `An organisation named ${taken.name} already exists`, 'conflict')
      return tx.organization.create({ data: { type: input.type, name: input.name } })
    },
    reload: (tx, id) => tx.organization.findUnique({ where: { id } }),
  })
}

/**
 * Rename or deactivate. There is no delete: an organisation referenced by a
 * program is history, and the schema has no cascade on purpose.
 */
export async function updateOrganization(id: string, input: UpdateOrganizationInput): Promise<Organization> {
  const existing = await prisma.organization.findUnique({ where: { id } })
  if (!existing) throw new ApiError(404, 'organisation not found', 'not_found')
  return prisma.organization.update({ where: { id }, data: input })
}
