import { beforeEach, describe, expect, it, vi } from 'vitest'
import { testPrisma } from '@hf/db/test'
import type { SeedResult } from '@hf/db'
import { scopeKey } from '@hf/domain'
import { programChecklistStatus } from '@hf/server'
import { as, freshSeed, nextHeadersMock, authServerMock, params, read } from './helpers'

vi.mock('next/headers', () => nextHeadersMock())
vi.mock('@/lib/auth-server', () => authServerMock())

const list = await import('@/app/api/checklists/route')
const detail = await import('@/app/api/checklists/[id]/route')
const draft = await import('@/app/api/checklists/[id]/draft/route')
const publish = await import('@/app/api/checklists/[id]/publish/route')
const revert = await import('@/app/api/checklists/[id]/revert/route')
const overrides = await import('@/app/api/checklists/overrides/route')

const jsonReq = (method: string, body: unknown) => new Request('http://x', { method, body: JSON.stringify(body), headers: { 'content-type': 'application/json' } })
const item = (textEn: string) => ({ kind: 'confirm', textEn, textHi: 'जाँच', pictogram: 'inspect' })
let seed: SeedResult

describe('checklist admin routes', () => {
  beforeEach(async () => { seed = await freshSeed() })

  it('admin only: a merchandiser gets 403 on the list and on every write', async () => {
    as(seed.users.merchandiser)
    expect((await list.GET(new Request('http://x'), params())).status).toBe(403)
    const any = await testPrisma.checklist.findFirstOrThrow()
    expect((await draft.PUT(jsonReq('PUT', { items: [item('x')] }), params({ id: any.id }))).status).toBe(403)
    expect((await publish.POST(jsonReq('POST', {}), params({ id: any.id }))).status).toBe(403)
  })

  it('saving a draft returns it; publishing advances the version and clears the draft', async () => {
    as(seed.users.admin)
    const l = await testPrisma.checklist.findUniqueOrThrow({ where: { scopeKey: scopeKey('qa', 'cutting', 'jacket', null) } })
    const saved = await read<{ checklist: { draft: { items: unknown[] } | null } }>(await draft.PUT(jsonReq('PUT', { items: [item('Only one'), { kind: 'photo', textEn: 'Photo', textHi: 'फ़ोटो', pictogram: 'camera' }] }), params({ id: l.id })))
    expect(saved.checklist.draft!.items).toHaveLength(2)
    const pub = await read<{ checklist: { publishedNumber: number; hasDraft: boolean } }>(await publish.POST(jsonReq('POST', {}), params({ id: l.id })))
    expect(pub.checklist).toMatchObject({ publishedNumber: 2, hasDraft: false })
    const d = await read<{ checklist: { published: { number: number; items: unknown[] } } }>(await detail.GET(new Request('http://x'), params({ id: l.id })))
    expect(d.checklist.published).toMatchObject({ number: 2 })
    expect(d.checklist.published.items).toHaveLength(2)
  })

  it('an override starts as a draft copy of the default, and revert removes it', async () => {
    as(seed.users.admin)
    const program = await testPrisma.program.findFirstOrThrow()
    const created = await read<{ checklist: { id: string; programId: string; draft: { items: unknown[] } } }>(await overrides.POST(jsonReq('POST', { programId: program.id, step: 'qa', stage: 'stitching', category: 'jacket' }), params()))
    expect(created.checklist.programId).toBe(program.id)
    expect(created.checklist.draft.items).toHaveLength(5)
    await publish.POST(jsonReq('POST', {}), params({ id: created.checklist.id }))
    expect((await programChecklistStatus(program.id)).find((r) => r.step === 'qa' && r.stage === 'stitching' && r.category === 'jacket')!.customised).toBe(true)
    expect((await revert.POST(jsonReq('POST', {}), params({ id: created.checklist.id }))).status).toBe(200)
    expect((await programChecklistStatus(program.id)).find((r) => r.step === 'qa' && r.stage === 'stitching' && r.category === 'jacket')!.customised).toBe(false)
  })

  it('a measure item round-trips its unit and range through the draft, and publishing resolves them', async () => {
    as(seed.users.admin)
    const l = await testPrisma.checklist.findUniqueOrThrow({ where: { scopeKey: scopeKey('qa', 'cutting', 'jacket', null) } })
    const measure = { kind: 'measure', textEn: 'Chest width', textHi: 'छाती की चौड़ाई', pictogram: 'measure', unit: 'cm', min: 44, max: 46 }
    const saved = await read<{ checklist: { draft: { items: Array<{ kind: string; unit: string | null; min: number | null; max: number | null }> } | null } }>(
      await draft.PUT(jsonReq('PUT', { items: [measure] }), params({ id: l.id })),
    )
    expect(saved.checklist.draft!.items).toHaveLength(1)
    expect(saved.checklist.draft!.items[0]).toMatchObject({ kind: 'measure', unit: 'cm', min: 44, max: 46 })

    await publish.POST(jsonReq('POST', {}), params({ id: l.id }))
    const d = await read<{ checklist: { published: { items: Array<{ kind: string; unit: string | null; min: number | null; max: number | null }> } } }>(
      await detail.GET(new Request('http://x'), params({ id: l.id })),
    )
    expect(d.checklist.published.items[0]).toMatchObject({ kind: 'measure', unit: 'cm', min: 44, max: 46 })
  })
})
