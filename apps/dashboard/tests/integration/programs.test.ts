import { beforeEach, describe, expect, it, vi } from 'vitest'
import { testPrisma } from '@hf/db/test'
import type { SeedResult } from '@hf/db'
import { as, freshSeed, nextHeadersMock, authServerMock, params, patch, post, read } from './helpers'

vi.mock('next/headers', () => nextHeadersMock())
vi.mock('@/lib/auth-server', () => authServerMock())

const create = await import('@/app/api/programs/route')
const update = await import('@/app/api/programs/[id]/route')

let seed: SeedResult
const buyer = () => testPrisma.organization.findFirstOrThrow({ where: { type: 'buyer' } })
const agent = () => testPrisma.organization.findFirstOrThrow({ where: { type: 'agent' } })

describe('programs', () => {
  beforeEach(async () => { seed = await freshSeed(); as(seed.users.merchandiser) })

  it('creates a direct program (no agent)', async () => {
    const res = await create.POST(post({ name: 'Spring 27', buyerId: (await buyer()).id, season: 'SS27' }), params())
    expect(res.status).toBe(201)
    expect((await read(res)).program).toMatchObject({ name: 'Spring 27', season: 'SS27', agentId: null })
  })

  it('creates a program through a buying house', async () => {
    const res = await create.POST(post({ name: 'Spring 27', buyerId: (await buyer()).id, agentId: (await agent()).id }), params())
    expect(res.status).toBe(201)
    expect((await read(res)).program).toMatchObject({ agentId: (await agent()).id })
  })

  it('the buyer must be an active buyer organisation', async () => {
    const res = await create.POST(post({ name: 'X', buyerId: (await agent()).id }), params())
    expect(res.status).toBe(422)
    expect((await read(res)).error).toMatchObject({ code: 'invalid_buyer' })
    const b = await buyer()
    await testPrisma.organization.update({ where: { id: b.id }, data: { active: false } })
    expect((await create.POST(post({ name: 'X', buyerId: b.id }), params())).status).toBe(422)
  })

  it('the agent must be an active agent organisation', async () => {
    const res = await create.POST(post({ name: 'X', buyerId: (await buyer()).id, agentId: (await buyer()).id }), params())
    expect(res.status).toBe(422)
    expect((await read(res)).error).toMatchObject({ code: 'invalid_agent' })
  })

  it('management gets 403', async () => {
    as(seed.users.management)
    expect((await create.POST(post({ name: 'X', buyerId: (await buyer()).id }), params())).status).toBe(403)
  })

  it('replays a key', async () => {
    const key = 'prog-key-0001'
    const a = await read<{ program: { id: string } }>(await create.POST(post({ name: 'Once', buyerId: (await buyer()).id }, key), params()))
    const res = await create.POST(post({ name: 'Once', buyerId: (await buyer()).id }, key), params())
    expect(res.status).toBe(200)
    expect((await read<{ program: { id: string } }>(res)).program.id).toBe(a.program.id)
    expect(await testPrisma.program.count({ where: { name: 'Once' } })).toBe(1)
  })

  it('edits name, season and agent; can drop the agent to direct', async () => {
    const program = await testPrisma.program.findFirstOrThrow({ where: { name: 'Autumn 26' } })
    const res = await update.PATCH(patch({ name: 'Autumn 2026', season: null, agentId: null }), params({ id: program.id }))
    expect(res.status).toBe(200)
    expect(await testPrisma.program.findUniqueOrThrow({ where: { id: program.id } })).toMatchObject({ name: 'Autumn 2026', season: null, agentId: null })
  })

  it('unknown program is 404', async () => {
    expect((await update.PATCH(patch({ name: 'x' }), params({ id: '00000000-0000-4000-8000-000000000000' }))).status).toBe(404)
  })
})
