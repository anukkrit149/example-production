import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resetTestDb, testPrisma } from '@hf/db/test'
import { seedAll, type SeedResult } from '@hf/db'
import { assertChecklistPassed, resolveChecklistVersion } from '@hf/server'

const cookie = { value: 'dev:store' }
vi.mock('next/headers', () => ({ cookies: async () => ({ get: (n: string) => (n === 'hf_dev_user' && cookie.value ? { value: cookie.value } : undefined) }) }))

const checklists = await import('@/app/api/checklists/route')
const activateById = await import('@/app/api/pieces/[id]/activate/route')
const activateByLine = await import('@/app/api/pieces/activate/route')
const qa = await import('@/app/api/pieces/[id]/qa/route')
const issue = await import('@/app/api/pieces/[id]/issue/route')
const receive = await import('@/app/api/pieces/[id]/receive/route')

let seed: SeedResult
const photo = async () => (await testPrisma.attachment.create({ data: { storageKey: `t/${crypto.randomUUID()}.jpg`, mime: 'image/jpeg', bytes: 1, takenById: seed.users.store.id } })).id
const post = (body: unknown, key = crypto.randomUUID()) => new Request('http://x', { method: 'POST', body: JSON.stringify(body), headers: { 'idempotency-key': key } })
const params = (p: Record<string, string>) => ({ params: Promise.resolve(p) })

/** Fetch the resolved checklist for a piece and answer every item true (materials get one line). */
async function answered(pieceId: string, step: string, stage: string | null) {
  const res = await checklists.GET(new Request(`http://x/api/checklists?pieceId=${pieceId}&step=${step}${stage ? `&stage=${stage}` : ''}`), params({}))
  const { checklist } = await res.json()
  return { versionId: checklist.id, answers: checklist.items.map((i: { id: string; kind: string }) => ({ itemId: i.id, value: true, ...(i.kind === 'materials' ? { materials: [{ code: 'ZIP-01', qty: 1, unit: 'pc' }] } : {}) })) }
}

describe('checklist-gated routes', () => {
  beforeEach(async () => { await resetTestDb(); seed = await seedAll(testPrisma); process.env.DEV_AUTH = 'true'; cookie.value = 'dev:store' })

  it('GET /api/checklists resolves the piece\'s list in both languages', async () => {
    const p = seed.pieces[0]!
    const res = await checklists.GET(new Request(`http://x/api/checklists?pieceId=${p.id}&step=activate`), params({}))
    expect(res.status).toBe(200)
    const { checklist } = await res.json()
    expect(checklist.step).toBe('activate')
    expect(checklist.items[0]).toMatchObject({ kind: 'confirm', textEn: 'Leather lot matches the ticket', pictogram: 'leather-lot' })
    expect(checklist.items.at(-1).kind).toBe('photo')
  })

  it('activate by scanned piece needs the checklist and stores it on the event', async () => {
    const p = seed.pieces[0]!
    const bare = await activateById.POST(post({ leatherLot: 'LOT-1', attachmentIds: [await photo()] }), params({ id: p.id }))
    expect(bare.status).toBe(400)
    const res = await activateById.POST(post({ leatherLot: 'LOT-1', attachmentIds: [await photo()], checklist: await answered(p.id, 'activate', null) }), params({ id: p.id }))
    expect(res.status).toBe(200)
    const { piece } = await res.json()
    expect(piece.state).toBe('CUT_PENDING_QA')
    const ev = await testPrisma.pieceEvent.findFirstOrThrow({ where: { pieceId: p.id, eventType: 'PIECE_ACTIVATED' } })
    const d = ev.details as { checklist: { checklistNumber: number; answers: Array<{ textEn: string; value: boolean }> } }
    expect(d.checklist.checklistNumber).toBe(1)
    expect(d.checklist.answers).toHaveLength(4)
    expect(d.checklist.answers[0]).toMatchObject({ textEn: 'Leather lot matches the ticket', value: true })
  })

  it('a missing item is a readable 422 and nothing moves', async () => {
    const p = seed.pieces[1]!
    const a = await answered(p.id, 'activate', null)
    const res = await activateById.POST(post({ leatherLot: 'LOT-1', attachmentIds: [await photo()], checklist: { ...a, answers: a.answers.slice(1) } }), params({ id: p.id }))
    expect(res.status).toBe(422)
    expect((await res.json()).error).toMatchObject({ code: 'checklist_incomplete', message: 'not confirmed: Leather lot matches the ticket' })
    expect((await testPrisma.piece.findUniqueOrThrow({ where: { id: p.id } })).state).toBe('PLANNED')
  })

  it('activate by line item (no label) is gated the same way', async () => {
    const li = seed.lineItems[0]!
    const p = seed.pieces[0]!
    const res = await activateByLine.POST(post({ lineItemId: li.id, leatherLot: 'LOT-1', attachmentIds: [await photo()], checklist: await answered(p.id, 'activate', null) }), params({}))
    expect(res.status).toBe(200)
  })

  it('QA pass needs the stage checklist; a fail does not, but needs a defect', async () => {
    const p = seed.pieces[0]!
    await activateById.POST(post({ leatherLot: 'LOT-1', attachmentIds: [await photo()], checklist: await answered(p.id, 'activate', null) }), params({ id: p.id }))
    cookie.value = 'dev:qa'
    const fail = await qa.POST(post({ stage: 'cutting', result: 'fail', defectCodes: ['CUT_SHORT'], attachmentIds: [await photo()] }), params({ id: p.id }))
    expect(fail.status).toBe(200)
    const pass = await qa.POST(post({ stage: 'cutting', result: 'pass', attachmentIds: [await photo()], checklist: await answered(p.id, 'qa', 'cutting') }), params({ id: p.id }))
    expect(pass.status).toBe(200)
    expect((await pass.json()).piece.state).toBe('CUT_OK')
  })

  it('stitching issue needs materials on the materials item; receive records shortage', async () => {
    const p = seed.pieces[0]!
    const w = seed.workers[2]!  // tailor
    await activateById.POST(post({ leatherLot: 'LOT-1', attachmentIds: [await photo()], checklist: await answered(p.id, 'activate', null) }), params({ id: p.id }))
    cookie.value = 'dev:qa'
    await qa.POST(post({ stage: 'cutting', result: 'pass', attachmentIds: [await photo()], checklist: await answered(p.id, 'qa', 'cutting') }), params({ id: p.id }))
    cookie.value = 'dev:store'
    // walk pasting quickly through the service is not allowed here — use the routes with the pasting checklists
    const paster = seed.workers[1]!
    expect((await issue.POST(post({ stage: 'pasting', workerId: paster.id, attachmentIds: [await photo()], checklist: await answered(p.id, 'issue', 'pasting') }), params({ id: p.id }))).status).toBe(200)
    expect((await receive.POST(post({ stage: 'pasting', workerId: paster.id, attachmentIds: [await photo()], checklist: await answered(p.id, 'receive', 'pasting') }), params({ id: p.id }))).status).toBe(200)
    cookie.value = 'dev:qa'
    await qa.POST(post({ stage: 'pasting', result: 'pass', attachmentIds: [await photo()], checklist: await answered(p.id, 'qa', 'pasting') }), params({ id: p.id }))
    cookie.value = 'dev:store'
    const a = await answered(p.id, 'issue', 'stitching')
    const noLines = { ...a, answers: a.answers.map((x: { materials?: unknown }) => ({ ...x, materials: undefined })) }
    const refused = await issue.POST(post({ stage: 'stitching', workerId: w.id, attachmentIds: [await photo()], checklist: noLines }), params({ id: p.id }))
    expect(refused.status).toBe(422)
    expect((await refused.json()).error.code).toBe('checklist_materials_required')
    const ok = await issue.POST(post({ stage: 'stitching', workerId: w.id, attachmentIds: [await photo()], checklist: a }), params({ id: p.id }))
    expect(ok.status).toBe(200)
    const issued = await testPrisma.pieceEvent.findFirstOrThrow({ where: { pieceId: p.id, eventType: 'ISSUED', stage: 'stitching' } })
    expect((issued.details as { materials: unknown[] }).materials).toEqual([{ code: 'ZIP-01', qty: 1, unit: 'pc' }])
    const back = await receive.POST(post({ stage: 'stitching', workerId: w.id, shortage: 'one zip missing', attachmentIds: [await photo()], checklist: await answered(p.id, 'receive', 'stitching') }), params({ id: p.id }))
    expect(back.status).toBe(200)
    const received = await testPrisma.pieceEvent.findFirstOrThrow({ where: { pieceId: p.id, eventType: 'RECEIVED', stage: 'stitching' } })
    expect((received.details as { shortage: string }).shortage).toBe('one zip missing')
  })

  it('a measurement in range passes and is recorded with its range; out of range is refused on a pass', async () => {
    const list = await testPrisma.checklist.findFirstOrThrow({ where: { scopeKey: 'qa|stitching|jacket|' } })
    const v = await testPrisma.checklistVersion.findFirstOrThrow({ where: { checklistId: list.id, publishedAt: { not: null } } })
    const item = await testPrisma.checklistItem.create({ data: { versionId: v.id, position: 99, kind: 'measure', textEn: 'Arm hole', textHi: 'आर्म होल', pictogram: 'measure', unit: 'cm', min: 44, max: 46 } })
    const resolved = await resolveChecklistVersion({ step: 'qa', stage: 'stitching', category: 'jacket', programId: null })
    const answers = resolved!.items.map((i) => ({ itemId: i.id, value: i.kind === 'measure' ? 45.5 : (true as const), ...(i.kind === 'materials' ? { materials: [{ code: 'ZIP-01', qty: 1, unit: 'pc' }] } : {}) }))
    const record = await assertChecklistPassed({ resolved, checklist: { versionId: resolved!.id, answers } })
    expect(record.answers.find((a) => a.itemId === item.id)).toMatchObject({ kind: 'measure', value: 45.5, unit: 'cm', min: 44, max: 46 })

    const high = answers.map((a) => (a.itemId === item.id ? { ...a, value: 47 } : a))
    await expect(assertChecklistPassed({ resolved, checklist: { versionId: resolved!.id, answers: high } })).rejects.toMatchObject({ status: 422, code: 'checklist_measure_out_of_range' })
    const recorded = await assertChecklistPassed({ resolved, checklist: { versionId: resolved!.id, answers: high } }, { enforceRange: false })
    expect(recorded.answers.find((a) => a.itemId === item.id)!.value).toBe(47)
    const missing = answers.map((a) => (a.itemId === item.id ? { ...a, value: true as const } : a))
    await expect(assertChecklistPassed({ resolved, checklist: { versionId: resolved!.id, answers: missing } })).rejects.toMatchObject({ code: 'checklist_measure_required' })
  })
})
