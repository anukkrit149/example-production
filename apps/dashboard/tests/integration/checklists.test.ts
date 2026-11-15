import { beforeEach, describe, expect, it } from 'vitest'
import { testPrisma } from '@hf/db/test'
import type { SeedResult } from '@hf/db'
import { scopeKey } from '@hf/domain'
import { assertChecklistPassed, createOverride, getChecklist, programCategories, programChecklistStatus, publishDraft, resolveChecklistVersion, resolveForPiece, revertOverride, saveDraft } from '@hf/server'
import { freshSeed } from './helpers'

let seed: SeedResult
const programId = async () => (await testPrisma.program.findFirstOrThrow()).id

describe('checklist service', () => {
  beforeEach(async () => { seed = await freshSeed() })

  it('resolves the seeded jacket stitching QA default for a jacket piece', async () => {
    const r = await resolveForPiece(seed.pieces[0]!.id, 'qa', 'stitching')
    expect(r).not.toBeNull()
    expect(r!.number).toBe(1)
    expect(r!.programId).toBeNull()
    expect(r!.items.map((i) => i.textHi)[0]).toBe('दोनों बाजू एक लाइन में हैं')
  })

  it('outerwear resolves to the jacket lists', async () => {
    const jacket = await resolveChecklistVersion({ step: 'qa', stage: 'cutting', category: 'jacket', programId: null })
    const outerwear = await resolveChecklistVersion({ step: 'qa', stage: 'cutting', category: 'outerwear', programId: null })
    expect(outerwear!.id).toBe(jacket!.id)
  })

  it('refuses a category that is not a style category', async () => {
    await expect(resolveChecklistVersion({ step: 'qa', stage: 'cutting', category: 'hat', programId: null }))
      .rejects.toMatchObject({ code: 'invalid_category', status: 422 })
  })

  it('a program override wins only once published, and reverting restores the default', async () => {
    const pid = await programId()
    const before = await resolveChecklistVersion({ step: 'qa', stage: 'stitching', category: 'jacket', programId: pid })
    const ov = await createOverride({ programId: pid, step: 'qa', stage: 'stitching', category: 'jacket' })
    const drafted = await getChecklist(ov.id)
    expect(drafted.draft!.items).toHaveLength(5)   // copied from the default
    // Draft is invisible to the floor.
    expect((await resolveChecklistVersion({ step: 'qa', stage: 'stitching', category: 'jacket', programId: pid }))!.id).toBe(before!.id)
    await saveDraft(ov.id, { items: [{ kind: 'confirm', textEn: 'Collar sits flat', textHi: 'कॉलर सपाट है', pictogram: 'inspect' }, { kind: 'photo', textEn: 'Photo', textHi: 'फ़ोटो', pictogram: 'camera' }] })
    await publishDraft(ov.id, seed.users.admin.id)
    const after = await resolveChecklistVersion({ step: 'qa', stage: 'stitching', category: 'jacket', programId: pid })
    expect(after!.programId).toBe(pid)
    expect(after!.items.map((i) => i.textEn)).toEqual(['Collar sits flat', 'Photo'])
    expect((await programChecklistStatus(pid)).find((s) => s.step === 'qa' && s.stage === 'stitching' && s.category === 'jacket')).toMatchObject({ customised: true, publishedNumber: 1 })
    await revertOverride(ov.id)
    expect((await resolveChecklistVersion({ step: 'qa', stage: 'stitching', category: 'jacket', programId: pid }))!.id).toBe(before!.id)
    // The retired override is no longer this program's row for that scope.
    expect((await programChecklistStatus(pid)).find((s) => s.step === 'qa' && s.stage === 'stitching' && s.category === 'jacket')).toMatchObject({ customised: false, id: (await testPrisma.checklist.findUniqueOrThrow({ where: { scopeKey: scopeKey('qa', 'stitching', 'jacket', null) } })).id })
    // The retired key no longer matches, so customising again is a fresh
    // override whose draft is a copy of the current default.
    const again = await createOverride({ programId: pid, step: 'qa', stage: 'stitching', category: 'jacket' })
    expect(again.id).not.toBe(ov.id)
    expect(again.draft!.items.map((i) => i.textEn)).toEqual(before!.items.map((i) => i.textEn))
    expect((await programChecklistStatus(pid)).find((s) => s.step === 'qa' && s.stage === 'stitching' && s.category === 'jacket')).toMatchObject({ customised: true, publishedNumber: null })
  })

  it('publishing a default creates version 2 and leaves version 1 untouched', async () => {
    const list = await testPrisma.checklist.findUniqueOrThrow({ where: { scopeKey: scopeKey('qa', 'cutting', 'jacket', null) } })
    await saveDraft(list.id, { items: [{ kind: 'confirm', textEn: 'Only one check', textHi: 'सिर्फ़ एक जाँच', pictogram: 'count' }] })
    await publishDraft(list.id, seed.users.admin.id)
    const versions = await testPrisma.checklistVersion.findMany({ where: { checklistId: list.id }, orderBy: { number: 'asc' }, include: { items: true } })
    expect(versions.map((v) => v.number)).toEqual([1, 2])
    expect(versions[0]!.items).toHaveLength(5)
    expect(versions[1]!.items).toHaveLength(1)
  })

  it('two concurrent publishes of one draft stamp it once; the loser is refused', async () => {
    const list = await testPrisma.checklist.findUniqueOrThrow({ where: { scopeKey: scopeKey('qa', 'cutting', 'jacket', null) } })
    await saveDraft(list.id, { items: [{ kind: 'confirm', textEn: 'Only one check', textHi: 'सिर्फ़ एक जाँच', pictogram: 'count' }] })
    // Both calls read the draft before either writes: the check-then-act window.
    const results = await Promise.allSettled([
      publishDraft(list.id, seed.users.admin.id),
      publishDraft(list.id, seed.users.admin.id),
    ])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    const rejected = results.filter((r) => r.status === 'rejected')
    expect(rejected).toHaveLength(1)
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({ code: 'no_draft', status: 422 })
    expect(await testPrisma.checklistVersion.count({ where: { checklistId: list.id, publishedAt: { not: null } } })).toBe(2)
  })

  it('publishing the same draft twice publishes once and then refuses', async () => {
    const list = await testPrisma.checklist.findUniqueOrThrow({ where: { scopeKey: scopeKey('qa', 'cutting', 'jacket', null) } })
    await saveDraft(list.id, { items: [{ kind: 'confirm', textEn: 'Only one check', textHi: 'सिर्फ़ एक जाँच', pictogram: 'count' }] })
    const first = await publishDraft(list.id, seed.users.admin.id)
    expect(first.publishedNumber).toBe(2)
    expect(first.draft).toBeNull()
    const stamped = await testPrisma.checklistVersion.findFirstOrThrow({ where: { checklistId: list.id, number: 2 } })
    expect(stamped.publishedAt).not.toBeNull()

    await expect(publishDraft(list.id, seed.users.admin.id)).rejects.toMatchObject({ code: 'no_draft', status: 422 })

    // The refused second publish left the first stamp exactly as it was.
    const after = await testPrisma.checklistVersion.findMany({ where: { checklistId: list.id, number: 2 } })
    expect(after).toHaveLength(1)
    expect(after[0]!.publishedAt!.toISOString()).toBe(stamped.publishedAt!.toISOString())
    expect(await testPrisma.checklistVersion.count({ where: { checklistId: list.id, publishedAt: null } })).toBe(0)
  })

  it('the gate refuses a stale version, a missing item, and a materials item without lines; passes otherwise', async () => {
    const r = (await resolveForPiece(seed.pieces[0]!.id, 'issue', 'stitching'))!
    const all = r.items.map((i) => ({ itemId: i.id, value: true as const }))
    await expect(assertChecklistPassed({ resolved: r, checklist: { versionId: crypto.randomUUID(), answers: all } })).rejects.toMatchObject({ code: 'checklist_stale' })
    await expect(assertChecklistPassed({ resolved: r, checklist: { versionId: r.id, answers: all.slice(1) } })).rejects.toMatchObject({ code: 'checklist_incomplete' })
    await expect(assertChecklistPassed({ resolved: r, checklist: { versionId: r.id, answers: all } })).rejects.toMatchObject({ code: 'checklist_materials_required' })
    const withMaterials = all.map((a) => (r.items.find((i) => i.id === a.itemId)!.kind === 'materials' ? { ...a, materials: [{ code: 'ZIP-01', qty: 1, unit: 'pc' }] } : a))
    const record = await assertChecklistPassed({ resolved: r, checklist: { versionId: r.id, answers: withMaterials } })
    expect(record.checklistVersionId).toBe(r.id)
    expect(record.checklistNumber).toBe(1)
    expect(record.answers).toHaveLength(r.items.length)
    expect(record.answers.find((a) => a.kind === 'materials')!.materials).toEqual([{ code: 'ZIP-01', qty: 1, unit: 'pc' }])
  })

  it('detail lists every version newest first, the draft with no publisher', async () => {
    const l = await testPrisma.checklist.findUniqueOrThrow({ where: { scopeKey: scopeKey('qa', 'stitching', 'jacket', null) } })
    await saveDraft(l.id, { items: [{ kind: 'confirm', textEn: 'One', textHi: 'एक', pictogram: 'inspect' }] })
    await publishDraft(l.id, seed.users.admin.id)
    await saveDraft(l.id, { items: [{ kind: 'confirm', textEn: 'Two', textHi: 'दो', pictogram: 'inspect' }] })
    const d = await getChecklist(l.id)
    expect(d.versions.map((v) => v.number)).toEqual([3, 2, 1])
    expect(d.versions[0]).toMatchObject({ number: 3, publishedAt: null, publishedBy: null, itemCount: 1 })
    expect(d.versions[1]).toMatchObject({ number: 2, publishedBy: seed.users.admin.name, itemCount: 1 })
    expect(typeof d.versions[1]!.publishedAt).toBe('string')
  })

  it('programCategories folds outerwear into jacket and lists only what the program orders', async () => {
    const program = await testPrisma.program.findFirstOrThrow()
    expect(await programCategories(program.id)).toEqual(['jacket', 'bag'])
    const outer = await testPrisma.style.create({ data: { styleCode: 'OW-001', category: 'outerwear', gender: 'mens' } })
    const order = await testPrisma.order.findFirstOrThrow({ where: { programId: program.id } })
    await testPrisma.orderLineItem.create({ data: { orderId: order.id, styleId: outer.id, size: 'M', shade: 'BLK', quantity: 1 } })
    expect(await programCategories(program.id)).toEqual(['jacket', 'bag'])
    const other = await testPrisma.program.create({ data: { name: 'Other', buyerId: program.buyerId } })
    expect(await programCategories(other.id)).toEqual([])
  })
})
