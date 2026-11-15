import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resetTestDb, testPrisma } from '@hf/db/test'
import { seedAll } from '@hf/db'

vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => ({ value: 'dev:store' }) }) }))
vi.mock('@hf/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@hf/server')>()
  return {
    ...actual,
    presignPhotoUpload: async (key: string) => `http://minio.local/put/${key}`,
    objectExists: async (key: string) => ({ exists: key.includes('present'), bytes: 4321 }),
    photoUrl: (key: string) => `http://minio.local/hf-photos/${key}`,
  }
})

const { POST } = await import('@/app/api/uploads/route')
const confirm = await import('@/app/api/uploads/[attachmentId]/confirm/route')

describe('POST /api/uploads', () => {
  beforeEach(async () => { await resetTestDb(); await seedAll(testPrisma); process.env.DEV_AUTH = 'true' })

  it('creates an unlinked attachment and returns a presigned url', async () => {
    const res = await POST(
      new Request('http://x/api/uploads', { method: 'POST', body: JSON.stringify({ mime: 'image/jpeg', bytes: 120000 }) }),
      { params: Promise.resolve({}) },
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.uploadUrl).toContain(body.storageKey)
    const row = await testPrisma.attachment.findUnique({ where: { id: body.attachmentId } })
    expect(row?.pieceEventId).toBeNull()
    expect(row?.confirmedAt).toBeNull()
  })

  it('confirm fails when the object is not in the bucket', async () => {
    const user = await testPrisma.user.findFirstOrThrow({ where: { role: 'store' } })
    const att = await testPrisma.attachment.create({ data: { storageKey: 'photos/missing.jpg', mime: 'image/jpeg', bytes: 0, takenById: user.id } })
    const res = await confirm.POST(new Request('http://x', { method: 'POST' }), { params: Promise.resolve({ attachmentId: att.id }) })
    expect(res.status).toBe(422)
    expect((await res.json()).error.code).toBe('upload_missing')
    expect((await testPrisma.attachment.findUniqueOrThrow({ where: { id: att.id } })).confirmedAt).toBeNull()
  })

  it('confirm succeeds and records bytes when the object exists', async () => {
    const user = await testPrisma.user.findFirstOrThrow({ where: { role: 'store' } })
    const att = await testPrisma.attachment.create({ data: { storageKey: 'photos/present.jpg', mime: 'image/jpeg', bytes: 0, takenById: user.id } })
    const res = await confirm.POST(new Request('http://x', { method: 'POST' }), { params: Promise.resolve({ attachmentId: att.id }) })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    const row = await testPrisma.attachment.findUniqueOrThrow({ where: { id: att.id } })
    expect(row.bytes).toBe(4321)
    expect(row.confirmedAt).toBeInstanceOf(Date)
  })
})
