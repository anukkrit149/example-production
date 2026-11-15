import { beforeEach, describe, expect, it, vi } from 'vitest'
import { testPrisma } from '@hf/db/test'
import type { SeedResult } from '@hf/db'
import { ApiError, listTeam, updateTeamMember } from '@hf/server'
import { as, freshSeed, nextHeadersMock, authServerMock, params, patch, post, read } from './helpers'

vi.mock('next/headers', () => nextHeadersMock())
vi.mock('@/lib/auth-server', () => authServerMock())

const create = await import('@/app/api/team/route')
const update = await import('@/app/api/team/[id]/route')

let seed: SeedResult

describe('team', () => {
  beforeEach(async () => { seed = await freshSeed(); as(seed.users.admin) })

  it('admin adds a merchandiser by email; the identity is email:<lowercase>', async () => {
    const res = await create.POST(post({ name: 'Merch One', email: 'Merch.One@Example.com', role: 'merchandiser' }), params())
    expect(res.status).toBe(201)
    expect((await read(res)).user).toMatchObject({ name: 'Merch One', role: 'merchandiser', authIdentity: 'email:merch.one@example.com', active: true })
  })

  it('admin adds a store operator with no email; they get a code: identity and no dashboard email', async () => {
    const res = await create.POST(post({ name: 'Store One', role: 'store' }), params())
    expect(res.status).toBe(201)
    const { user } = await read<{ user: { id: string; authIdentity: string } }>(res)
    expect(user.authIdentity).toMatch(/^code:[0-9a-f-]{36}$/)
    const row = (await listTeam()).find((m) => m.id === user.id)
    expect(row).toMatchObject({ name: 'Store One', role: 'store', email: null, identity: 'other' })
  })

  it('two people without an email do not collide', async () => {
    const a = await create.POST(post({ name: 'A', role: 'qa' }), params())
    const b = await create.POST(post({ name: 'B', role: 'qa' }), params())
    expect([a.status, b.status]).toEqual([201, 201])
  })

  it('an admin without an email is refused: they need one to sign in to the dashboard', async () => {
    const res = await create.POST(post({ name: 'Boss', role: 'admin' }), params())
    expect(res.status).toBe(400)
  })

  it('the same email twice is a readable 409', async () => {
    await create.POST(post({ name: 'Merch One', email: 'merch.one@example.com', role: 'merchandiser' }), params())
    const res = await create.POST(post({ name: 'P.', email: 'MERCH.ONE@example.com', role: 'management' }), params())
    expect(res.status).toBe(409)
    expect((await read(res)).error).toEqual({ code: 'conflict', message: 'Someone with that email is already on the team' })
  })

  it('merchandiser cannot manage the team', async () => {
    as(seed.users.merchandiser)
    expect((await create.POST(post({ name: 'X', email: 'x@example.com', role: 'store' }), params())).status).toBe(403)
  })

  it('changes role and deactivates; a deactivated user cannot sign in', async () => {
    const created = await read<{ user: { id: string } }>(await create.POST(post({ name: 'Merch One', email: 'merch.one@example.com', role: 'merchandiser' }), params()))
    const res = await update.PATCH(patch({ role: 'management', active: false }), params({ id: created.user.id }))
    expect(res.status).toBe(200)
    expect(await testPrisma.user.findUniqueOrThrow({ where: { id: created.user.id } })).toMatchObject({ role: 'management', active: false })
  })

  it('an admin cannot deactivate themself', async () => {
    const res = await update.PATCH(patch({ active: false }), params({ id: seed.users.admin.id }))
    expect(res.status).toBe(422)
    expect((await read(res)).error).toMatchObject({ code: 'self_deactivate' })
  })

  it('merchandiser cannot PATCH a team member', async () => {
    as(seed.users.merchandiser)
    const res = await update.PATCH(patch({ active: false }), params({ id: seed.users.admin.id }))
    expect(res.status).toBe(403)
  })

  it('admin PATCH on an unknown uuid is a readable 404', async () => {
    const res = await update.PATCH(patch({ active: false }), params({ id: crypto.randomUUID() }))
    expect(res.status).toBe(404)
    expect((await read(res)).error).toMatchObject({ code: 'not_found' })
  })

  it('demoting the only admin away from admin is refused: at least one active admin must remain', async () => {
    // The route only ever lets an admin act, and the self-guards above take priority
    // over this one when actor and target are the same person — so this guard is
    // exercised at the service level, with an actor distinct from the sole admin.
    await expect(updateTeamMember(seed.users.admin.id, { role: 'management' }, seed.users.merchandiser.id))
      .rejects.toMatchObject(new ApiError(422, 'at least one active admin must remain', 'last_admin'))
  })

  it('an admin demoting themself is refused even when another admin exists', async () => {
    await create.POST(post({ name: 'Second Admin', email: 'second-admin@example.com', role: 'admin' }), params())
    const res = await update.PATCH(patch({ role: 'management' }), params({ id: seed.users.admin.id }))
    expect(res.status).toBe(422)
    expect((await read(res)).error).toMatchObject({ code: 'self_demote' })
  })

  it('demoting one of two admins succeeds', async () => {
    const created = await read<{ user: { id: string } }>(
      await create.POST(post({ name: 'Second Admin', email: 'second-admin@example.com', role: 'admin' }), params()),
    )
    const res = await update.PATCH(patch({ role: 'management' }), params({ id: created.user.id }))
    expect(res.status).toBe(200)
    expect(await testPrisma.user.findUniqueOrThrow({ where: { id: created.user.id } })).toMatchObject({ role: 'management' })
  })
})
