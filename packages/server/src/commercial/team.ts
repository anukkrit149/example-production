import { prisma, type User, type UserRole } from '@hf/db'
import type { CreateTeamMemberInput, UpdateTeamMemberInput } from '@hf/contracts'
import { ApiError } from '../api'
import { translatePrismaError } from '../errors'
import { codeIdentity, emailFromIdentity, emailIdentity } from '../identity'
import { idempotent } from '../idempotency'

export type TeamRow = { id: string; name: string; role: UserRole; active: boolean; email: string | null; identity: 'email' | 'other' }

export async function listTeam(): Promise<TeamRow[]> {
  const users = await prisma.user.findMany({ orderBy: [{ active: 'desc' }, { role: 'asc' }, { name: 'asc' }] })
  return users.map((u) => {
    const email = emailFromIdentity(u.authIdentity)
    return { id: u.id, name: u.name, role: u.role, active: u.active, email, identity: email ? 'email' : 'other' }
  })
}

/**
 * Nobody self-enrols. An admin adds a person here; with an email they sign in
 * to the dashboard, without one they wait for an operator code from the
 * phone's Admin screen.
 */
export async function addTeamMember(input: CreateTeamMemberInput, key: string) {
  try {
    return await idempotent({
      key,
      entity: 'user',
      run: (tx) => tx.user.create({ data: { name: input.name, role: input.role, authIdentity: input.email ? emailIdentity(input.email) : codeIdentity() } }),
      reload: (tx, id) => tx.user.findUnique({ where: { id } }),
    })
  } catch (e) {
    translatePrismaError(e)
  }
}

export async function updateTeamMember(id: string, input: UpdateTeamMemberInput, actorId: string): Promise<User> {
  const existing = await prisma.user.findUnique({ where: { id } })
  if (!existing) throw new ApiError(404, 'user not found', 'not_found')
  if (input.active === false && id === actorId) throw new ApiError(422, 'you cannot deactivate yourself', 'self_deactivate')
  if (input.role !== undefined && input.role !== 'admin' && id === actorId)
    throw new ApiError(422, 'you cannot remove your own admin role', 'self_demote')

  const removesAdmin =
    existing.role === 'admin' && existing.active &&
    (input.active === false || (input.role !== undefined && input.role !== 'admin'))
  if (removesAdmin) {
    const otherActiveAdmins = await prisma.user.count({ where: { role: 'admin', active: true, id: { not: id } } })
    if (otherActiveAdmins === 0) throw new ApiError(422, 'at least one active admin must remain', 'last_admin')
  }

  return prisma.user.update({ where: { id }, data: input })
}
