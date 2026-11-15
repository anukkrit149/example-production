import { beforeEach, describe, expect, it, vi } from 'vitest'
import { testPrisma } from '@hf/db/test'
import type { SeedResult } from '@hf/db'
import { getStyle, runPieceAction } from '@hf/server'
import { as, freshSeed, nextHeadersMock, authServerMock, params, patch, post, read } from './helpers'

vi.mock('next/headers', () => nextHeadersMock())
vi.mock('@/lib/auth-server', () => authServerMock())

const create = await import('@/app/api/styles/route')
const update = await import('@/app/api/styles/[id]/route')

let seed: SeedResult

describe('styles', () => {
  beforeEach(async () => { seed = await freshSeed(); as(seed.users.merchandiser) })

  it('creates a factory base style (no owner) and normalises the code', async () => {
    const res = await create.POST(post({ styleCode: ' bt-101 ', category: 'belt', gender: 'unisex', description: 'Classic belt' }), params())
    expect(res.status).toBe(201)
    expect((await read(res)).style).toMatchObject({ styleCode: 'BT-101', category: 'belt', ownerId: null, active: true })
  })

  it('creates a buyer-owned style', async () => {
    const buyer = await testPrisma.organization.findFirstOrThrow({ where: { type: 'buyer' } })
    const res = await create.POST(post({ styleCode: 'LJ-300', category: 'jacket', gender: 'womens', ownerId: buyer.id }), params())
    expect(res.status).toBe(201)
    expect((await read(res)).style).toMatchObject({ ownerId: buyer.id })
  })

  it('an inactive or unknown owner is 422', async () => {
    const res = await create.POST(post({ styleCode: 'LJ-301', category: 'jacket', gender: 'mens', ownerId: '00000000-0000-4000-8000-000000000000' }), params())
    expect(res.status).toBe(422)
    expect((await read(res)).error).toMatchObject({ code: 'invalid_owner' })
  })

  it('a taken code is a readable 409', async () => {
    const res = await create.POST(post({ styleCode: 'lj-204', category: 'jacket', gender: 'mens' }), params())
    expect(res.status).toBe(409)
    expect((await read(res)).error).toEqual({ code: 'conflict', message: 'Style code LJ-204 is already taken' })
  })

  it('a bad code is 400 validation with a message that names the field', async () => {
    const res = await create.POST(post({ styleCode: '1-BAD', category: 'jacket', gender: 'mens' }), params())
    expect(res.status).toBe(400)
    expect((await read(res)).error).toMatchObject({ code: 'validation', message: 'Style code: must be 2–12 letters, digits or hyphens, starting with a letter' })
  })

  it('management gets 403', async () => {
    as(seed.users.management)
    expect((await create.POST(post({ styleCode: 'X-1', category: 'bag', gender: 'unisex' }), params())).status).toBe(403)
  })

  it('edits description and active; renames the code while nothing is cut', async () => {
    const bag = await testPrisma.style.findUniqueOrThrow({ where: { styleCode: 'TB-018' } })
    const res = await update.PATCH(patch({ styleCode: 'TB-019', description: 'Tote, large', active: false }), params({ id: bag.id }))
    expect(res.status).toBe(200)
    expect(await testPrisma.style.findUniqueOrThrow({ where: { id: bag.id } })).toMatchObject({ styleCode: 'TB-019', description: 'Tote, large', active: false })
  })

  it('the code is frozen once any piece of the style has left PLANNED', async () => {
    const jacket = await testPrisma.style.findUniqueOrThrow({ where: { styleCode: 'LJ-204' } })
    const piece = seed.pieces.find((p) => p.lineItemId === seed.lineItems[0]!.id)!   // LJ-204 M
    await runPieceAction({
      pieceId: piece.id, user: seed.users.admin, idempotencyKey: 'styles-activate-1',
      event: { type: 'PIECE_ACTIVATED', stage: 'cutting' }, details: { leatherLot: 'L1', photoOverrideReason: 'test' },
    })
    const res = await update.PATCH(patch({ styleCode: 'LJ-205' }), params({ id: jacket.id }))
    expect(res.status).toBe(422)
    expect((await read(res)).error).toEqual({ code: 'style_code_frozen', message: 'LJ-204 is printed on labels already; the code cannot change' })
    // The description is still editable.
    expect((await update.PATCH(patch({ description: 'Coach jacket, lamb, v2' }), params({ id: jacket.id }))).status).toBe(200)
  })

  it('a cancelled piece does not freeze the code', async () => {
    const bag = await testPrisma.style.findUniqueOrThrow({ where: { styleCode: 'TB-018' } })
    const piece = seed.pieces.find((p) => p.lineItemId === seed.lineItems[2]!.id)!   // TB-018
    await runPieceAction({ pieceId: piece.id, user: seed.users.admin, idempotencyKey: 'styles-cancel-1', event: { type: 'PIECE_CANCELLED' }, details: { reason: 'test' } })
    expect((await update.PATCH(patch({ styleCode: 'TB-020' }), params({ id: bag.id }))).status).toBe(200)
  })

  it('renaming onto a taken code is 409', async () => {
    const bag = await testPrisma.style.findUniqueOrThrow({ where: { styleCode: 'TB-018' } })
    const res = await update.PATCH(patch({ styleCode: 'LJ-204' }), params({ id: bag.id }))
    expect(res.status).toBe(409)
    expect((await read<{ error: { message: string } }>(res)).error.message).toBe('Style code LJ-204 is already taken')
  })

  const confirmedPhoto = () => testPrisma.attachment.create({ data: { storageKey: `photos/test/${crypto.randomUUID()}.jpg`, mime: 'image/jpeg', bytes: 1234, takenById: seed.users.merchandiser.id, confirmedAt: new Date() } })

  it('creates a style with a confirmed reference photo and signs a url for it', async () => {
    const att = await confirmedPhoto()
    const res = await create.POST(post({ styleCode: 'LJ-777', category: 'jacket', gender: 'mens', referenceAttachmentId: att.id }), params())
    expect(res.status).toBe(201)
    const style = (await read<{ style: { id: string; referenceAttachmentId: string } }>(res)).style
    expect(style.referenceAttachmentId).toBe(att.id)
    const detail = await getStyle(style.id)
    expect(detail?.referenceAttachmentId).toBe(att.id)
    expect(detail?.referencePhotoUrl).toMatch(/^https?:\/\//)
    expect(detail?.referencePhotoUrl).toContain(att.storageKey)
  })

  it('refuses an unconfirmed photo, a photo on a piece event, and a photo another style already uses', async () => {
    const unconfirmed = await testPrisma.attachment.create({ data: { storageKey: `photos/test/${crypto.randomUUID()}.jpg`, mime: 'image/jpeg', bytes: 1, takenById: seed.users.merchandiser.id } })
    let res = await create.POST(post({ styleCode: 'LJ-778', category: 'jacket', gender: 'mens', referenceAttachmentId: unconfirmed.id }), params())
    expect(res.status).toBe(422)
    expect((await read(res)).error).toMatchObject({ code: 'reference_invalid' })

    const used = await confirmedPhoto()
    expect((await create.POST(post({ styleCode: 'LJ-779', category: 'jacket', gender: 'mens', referenceAttachmentId: used.id }), params())).status).toBe(201)
    res = await create.POST(post({ styleCode: 'LJ-780', category: 'jacket', gender: 'mens', referenceAttachmentId: used.id }), params())
    expect(res.status).toBe(422)

    const jacket = seed.pieces.find((p) => p.lineItemId === seed.lineItems[0]!.id)!
    await runPieceAction({
      pieceId: jacket.id, user: seed.users.admin, idempotencyKey: 'styles-ref-photo-event-1',
      event: { type: 'PIECE_ACTIVATED', stage: 'cutting' }, details: { leatherLot: 'L1', photoOverrideReason: 'test' },
    })
    const event = await testPrisma.pieceEvent.findFirstOrThrow()
    const onEvent = await testPrisma.attachment.create({ data: { storageKey: `photos/test/${crypto.randomUUID()}.jpg`, mime: 'image/jpeg', bytes: 1, takenById: seed.users.merchandiser.id, confirmedAt: new Date(), pieceEventId: event.id } })
    res = await create.POST(post({ styleCode: 'LJ-781', category: 'jacket', gender: 'mens', referenceAttachmentId: onEvent.id }), params())
    expect(res.status).toBe(422)
  })

  it('updating with null clears the photo; updating with a new photo replaces it', async () => {
    const first = await confirmedPhoto()
    const style = (await read<{ style: { id: string } }>(await create.POST(post({ styleCode: 'LJ-782', category: 'jacket', gender: 'mens', referenceAttachmentId: first.id }), params()))).style
    const second = await confirmedPhoto()
    let res = await update.PATCH(patch({ referenceAttachmentId: second.id }), params({ id: style.id }))
    expect(res.status).toBe(200)
    expect((await getStyle(style.id))?.referenceAttachmentId).toBe(second.id)
    res = await update.PATCH(patch({ referenceAttachmentId: null }), params({ id: style.id }))
    expect(res.status).toBe(200)
    expect((await getStyle(style.id))?.referenceAttachmentId).toBeNull()
    expect((await getStyle(style.id))?.referencePhotoUrl).toBeNull()
  })
})
