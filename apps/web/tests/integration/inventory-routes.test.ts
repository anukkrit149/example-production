import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resetTestDb, testPrisma } from '@hf/db/test'
import { seedAll, type SeedResult } from '@hf/db'

const cookie = { value: 'dev:qa' }
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (n: string) => (n === 'hf_dev_user' && cookie.value ? { value: cookie.value } : undefined) }),
}))
const vision = { available: true, calls: 0 }
vi.mock('@hf/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@hf/server')>()
  return {
    ...actual,
    photoUrl: async (key: string) => `http://minio.local/hf-photos/${key}`,
    photoUrls: async (keys: string[]) => new Map(keys.map((k) => [k, `http://minio.local/hf-photos/${k}`])),
    visionAvailable: () => vision.available,
    suggestFromPhoto: async (a: { kind: string }) => { vision.calls++; return a.kind === 'goods' ? { available: true, kind: 'goods', items: [{ code: 'ZIP', confidence: 0.9 }] } : { available: true, kind: 'document', document: { supplier: 'Rex', reference: 'DC-1', date: null, lines: [{ text: 'zip', quantity: 500, code: 'ZIP', confidence: 0.8 }] } } },
  }
})
// The suggest route downloads the photo through its signed url; answer with a tiny body.
vi.stubGlobal('fetch', async () => new Response(new Uint8Array([1, 2, 3]), { status: 200 }))

const items = await import('@/app/api/inventory/items/route')
const suggest = await import('@/app/api/inventory/suggest/route')
const status = await import('@/app/api/inventory/suggest/status/route')
const receipts = await import('@/app/api/inventory/receipts/route')
const receipt = await import('@/app/api/inventory/receipts/[id]/route')
const count = await import('@/app/api/inventory/receipts/[id]/count/route')

let seed: SeedResult
const params = (p: Record<string, string> = {}) => ({ params: Promise.resolve(p) })
const post = (body: unknown, key = crypto.randomUUID()) => new Request('http://x', { method: 'POST', body: JSON.stringify(body), headers: { 'idempotency-key': key, 'content-type': 'application/json' } })
const get = (url = 'http://x') => new Request(url)
const photo = async () => (await testPrisma.attachment.create({ data: { storageKey: `t/${crypto.randomUUID()}.jpg`, mime: 'image/jpeg', bytes: 1, takenById: seed.users.qa.id, confirmedAt: new Date() } })).id
const body = async () => ({ items: [{ itemId: seed.items[0]!.id, expectedQty: 500 }], photos: { goods: [await photo()], place: [await photo()], document: [await photo()] }, supplier: 'Rex' })

describe('inventory routes', () => {
  beforeEach(async () => { await resetTestDb(); seed = await seedAll(testPrisma); process.env.DEV_AUTH = 'true'; cookie.value = 'dev:qa'; vision.available = true; vision.calls = 0 })

  it('items lists active items in order for any signed-in user; signed out is 401', async () => {
    const res = await items.GET(get(), params())
    expect(res.status).toBe(200)
    expect((await res.json()).items.map((i: { code: string }) => i.code)).toEqual(['ZIP', 'WASH-LBL', 'PO-LBL'])
    cookie.value = ''
    expect((await items.GET(get(), params())).status).toBe(401)
  })

  it('anyone records; the receipt comes back with signed photos; a replay is 200 not 201', async () => {
    const key = crypto.randomUUID()
    const b = await body()
    const res = await receipts.POST(post(b, key), params())
    expect(res.status).toBe(201)
    const { receipt: r } = await res.json()
    expect(r.status).toBe('RECEIVED')
    expect(r.photos).toHaveLength(3)
    expect((await receipts.POST(post(b, key), params())).status).toBe(200)
    expect((await receipts.POST(new Request('http://x', { method: 'POST', body: JSON.stringify(b) }), params())).status).toBe(400)
  })

  it('the to-count list is store-only; "mine" works for anyone', async () => {
    await receipts.POST(post(await body()), params())
    expect((await receipts.GET(get('http://x?status=RECEIVED'), params())).status).toBe(403)
    const mine = await receipts.GET(get('http://x?mine=1'), params())
    expect((await mine.json()).receipts).toHaveLength(1)
    cookie.value = 'dev:store'
    const list = await receipts.GET(get('http://x?status=RECEIVED'), params())
    expect(list.status).toBe(200)
    expect((await list.json()).receipts).toHaveLength(1)
    cookie.value = 'dev:admin'
    expect((await receipts.GET(get('http://x?status=RECEIVED'), params())).status).toBe(200)
  })

  it('count is store-only, checks the version, and is once', async () => {
    const { receipt: r } = await (await receipts.POST(post(await body()), params())).json()
    const lines = [{ itemId: seed.items[0]!.id, expectedQty: 500, countedQty: 490 }]
    expect((await count.POST(post({ expectedVersion: 0, lines }), params({ id: r.id }))).status).toBe(403)
    cookie.value = 'dev:store'
    expect((await count.POST(post({ expectedVersion: 3, lines }), params({ id: r.id }))).status).toBe(409)
    const ok = await count.POST(post({ expectedVersion: 0, lines }), params({ id: r.id }))
    expect(ok.status).toBe(200)
    expect((await ok.json()).receipt).toMatchObject({ status: 'COUNTED', hasDiscrepancy: true, version: 1 })
    const again = await count.POST(post({ expectedVersion: 1, lines }), params({ id: r.id }))
    expect(again.status).toBe(409)
    expect((await again.json()).error.code).toBe('already_counted')
    const detail = await receipt.GET(get(), params({ id: r.id }))
    expect((await detail.json()).receipt.countedBy).toBe('Store Operator')
    expect((await receipt.GET(get(), params({ id: crypto.randomUUID() }))).status).toBe(404)
  })

  it('suggest reads the photo and returns the suggestion; unavailable without a key; a foreign or unconfirmed photo is refused', async () => {
    const id = await photo()
    const res = await suggest.POST(post({ attachmentId: id, kind: 'goods' }), params())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ available: true, kind: 'goods', items: [{ code: 'ZIP', confidence: 0.9 }] })
    expect(vision.calls).toBe(1)
    vision.available = false
    expect(await (await suggest.POST(post({ attachmentId: id, kind: 'document' }), params())).json()).toEqual({ available: false })
    expect((await status.GET(get(), params())).status).toBe(200)
    expect(await (await status.GET(get(), params())).json()).toEqual({ available: false })
    vision.available = true
    const unconfirmed = (await testPrisma.attachment.create({ data: { storageKey: 't/u.jpg', mime: 'image/jpeg', bytes: 1, takenById: seed.users.qa.id } })).id
    expect((await suggest.POST(post({ attachmentId: unconfirmed, kind: 'goods' }), params())).status).toBe(422)
    expect((await suggest.POST(post({ attachmentId: crypto.randomUUID(), kind: 'goods' }), params())).status).toBe(404)
  })

  it('suggest degrades to unavailable, not a 500, when the photo download itself fails', async () => {
    const id = await photo()
    vi.stubGlobal('fetch', async () => { throw new Error('network down') })
    try {
      const res = await suggest.POST(post({ attachmentId: id, kind: 'goods' }), params())
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ available: false })
    } finally {
      vi.stubGlobal('fetch', async () => new Response(new Uint8Array([1, 2, 3]), { status: 200 }))
    }
  })

  it('suggest skips the download and the model for a photo over the 2 MB guard', async () => {
    const id = (await testPrisma.attachment.create({ data: { storageKey: 't/big.jpg', mime: 'image/jpeg', bytes: 2_500_000, takenById: seed.users.qa.id, confirmedAt: new Date() } })).id
    const res = await suggest.POST(post({ attachmentId: id, kind: 'goods' }), params())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ available: false })
    expect(vision.calls).toBe(0)
  })
})
