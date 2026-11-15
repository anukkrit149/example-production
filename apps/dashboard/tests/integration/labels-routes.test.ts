import { beforeEach, describe, expect, it, vi } from 'vitest'
import { testPrisma } from '@hf/db/test'
import type { SeedResult } from '@hf/db'
import { as, freshSeed, nextHeadersMock, authServerMock, params, post, read } from './helpers'

vi.mock('next/headers', () => nextHeadersMock())
vi.mock('@/lib/auth-server', () => authServerMock())

const exportRoute = await import('@/app/api/labels/export/route')
const printedRoute = await import('@/app/api/labels/[batchId]/printed/route')
const fileRoute = await import('@/app/api/labels/[batchId]/file/route')

let seed: SeedResult

describe('labels routes', () => {
  beforeEach(async () => { seed = await freshSeed() })

  it('merchandiser exports every pending planned label of a line item as xlsx and gets a batch id', async () => {
    as(seed.users.merchandiser)
    const li = seed.lineItems[2]!
    const res = await exportRoute.POST(post({ kind: 'planned', format: 'xlsx', lineItemId: li.id }), params())
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('spreadsheetml')
    expect(res.headers.get('x-export-batch-id')).toMatch(/^[0-9a-f-]{36}$/)
    expect(res.headers.get('content-disposition')).toContain('labels-planned-')
  })

  it('management gets 403; a scope with nothing pending is 422', async () => {
    as(seed.users.management)
    expect((await exportRoute.POST(post({ kind: 'planned', format: 'csv', lineItemId: seed.lineItems[0]!.id }), params())).status).toBe(403)
    as(seed.users.merchandiser)
    await exportRoute.POST(post({ kind: 'planned', format: 'csv', lineItemId: seed.lineItems[1]!.id }), params())
    const again = await exportRoute.POST(post({ kind: 'planned', format: 'csv', lineItemId: seed.lineItems[1]!.id }), params())
    expect(again.status).toBe(422)
    expect((await read<{ error: { code: string } }>(again)).error.code).toBe('label_mismatch')
  })

  it('marking printed records copies; a second time is 409', async () => {
    as(seed.users.merchandiser)
    const res = await exportRoute.POST(post({ kind: 'planned', format: 'csv', lineItemId: seed.lineItems[1]!.id }), params())
    const batchId = res.headers.get('x-export-batch-id')!
    expect((await printedRoute.POST(post({ copies: 3 }), params({ batchId }))).status).toBe(200)
    expect((await testPrisma.exportBatch.findUniqueOrThrow({ where: { id: batchId } })).copies).toBe(3)
    expect((await printedRoute.POST(post({ copies: 1 }), params({ batchId }))).status).toBe(409)
  })

  it('the file route re-downloads a batch without stamping anything', async () => {
    as(seed.users.merchandiser)
    const res = await exportRoute.POST(post({ kind: 'planned', format: 'csv', lineItemId: seed.lineItems[1]!.id }), params())
    const batchId = res.headers.get('x-export-batch-id')!
    const first = await res.text()
    as(seed.users.management)
    const file = await fileRoute.GET(new Request('http://x'), params({ batchId }))
    expect(file.status).toBe(200)
    expect(await file.text()).toBe(first)
    expect(await testPrisma.exportBatch.count()).toBe(1)
  })
})
