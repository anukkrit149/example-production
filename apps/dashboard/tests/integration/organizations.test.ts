import { beforeEach, describe, expect, it, vi } from 'vitest'
import { testPrisma } from '@hf/db/test'
import type { SeedResult } from '@hf/db'
import { as, freshSeed, nextHeadersMock, authServerMock, params, patch, post, read, signedOut } from './helpers'

vi.mock('next/headers', () => nextHeadersMock())
vi.mock('@/lib/auth-server', () => authServerMock())

const create = await import('@/app/api/organizations/route')
const update = await import('@/app/api/organizations/[id]/route')

let seed: SeedResult

describe('organisations', () => {
  beforeEach(async () => { seed = await freshSeed() })

  it('merchandiser creates a buyer; 201 with the row', async () => {
    as(seed.users.merchandiser)
    const res = await create.POST(post({ type: 'buyer', name: 'Maison Rive' }), params())
    expect(res.status).toBe(201)
    const b = await read<{ organization: { id: string; type: string; name: string; active: boolean }; replayed: boolean }>(res)
    expect(b.organization).toMatchObject({ type: 'buyer', name: 'Maison Rive', active: true })
    expect(b.replayed).toBe(false)
  })

  it('a buying house is the same table with type agent', async () => {
    as(seed.users.admin)
    const res = await create.POST(post({ type: 'agent', name: 'Atlas Sourcing' }), params())
    expect(res.status).toBe(201)
    expect((await read(res)).organization).toMatchObject({ type: 'agent' })
  })

  it('replays the same Idempotency-Key without a second row', async () => {
    as(seed.users.merchandiser)
    const key = 'org-key-1234'
    const first = await read<{ organization: { id: string } }>(await create.POST(post({ type: 'buyer', name: 'Twice' }, key), params()))
    const second = await create.POST(post({ type: 'buyer', name: 'Twice' }, key), params())
    expect(second.status).toBe(200)
    const b = await read<{ organization: { id: string }; replayed: boolean }>(second)
    expect(b.replayed).toBe(true)
    expect(b.organization.id).toBe(first.organization.id)
    expect(await testPrisma.organization.count({ where: { name: 'Twice' } })).toBe(1)
  })

  it('a name already in use, in any case, is a readable 409', async () => {
    as(seed.users.merchandiser)
    const res = await create.POST(post({ type: 'buyer', name: 'nordheim gmbh' }), params())
    expect(res.status).toBe(409)
    expect((await read(res)).error).toEqual({ code: 'conflict', message: 'An organisation named Nordheim GmbH already exists' })
    expect(await testPrisma.organization.count({ where: { name: { equals: 'nordheim gmbh', mode: 'insensitive' } } })).toBe(1)
  })

  it('management cannot create: 403', async () => {
    as(seed.users.management)
    const res = await create.POST(post({ type: 'buyer', name: 'Nope' }), params())
    expect(res.status).toBe(403)
    expect((await read(res)).error).toMatchObject({ code: 'forbidden' })
  })

  it('signed out is 401', async () => {
    signedOut()
    expect((await create.POST(post({ type: 'buyer', name: 'Nope' }), params())).status).toBe(401)
  })

  it('rejects a bad body with 400 validation', async () => {
    as(seed.users.merchandiser)
    const res = await create.POST(post({ type: 'buying_house', name: '' }), params())
    expect(res.status).toBe(400)
    expect((await read(res)).error).toMatchObject({ code: 'validation' })
  })

  it('requires an Idempotency-Key', async () => {
    as(seed.users.merchandiser)
    const res = await create.POST(new Request('http://x', { method: 'POST', body: '{}' }), params())
    expect(res.status).toBe(400)
    expect((await read(res)).error).toMatchObject({ code: 'idempotency_key' })
  })

  it('renames and deactivates; never deletes', async () => {
    as(seed.users.merchandiser)
    const org = await testPrisma.organization.findFirstOrThrow({ where: { name: 'Nordheim GmbH' } })
    const res = await update.PATCH(patch({ name: 'Nordheim AG', active: false }), params({ id: org.id }))
    expect(res.status).toBe(200)
    const after = await testPrisma.organization.findUniqueOrThrow({ where: { id: org.id } })
    expect(after).toMatchObject({ name: 'Nordheim AG', active: false })
    // The program that references it survives untouched.
    expect(await testPrisma.program.count({ where: { buyerId: org.id } })).toBe(1)
  })

  it('unknown id is 404', async () => {
    as(seed.users.admin)
    const res = await update.PATCH(patch({ name: 'x' }), params({ id: '00000000-0000-4000-8000-000000000000' }))
    expect(res.status).toBe(404)
  })
})
