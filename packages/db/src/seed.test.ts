import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_CHECKLISTS, scopeKey } from '@hf/domain'
import { resetTestDb, testPrisma } from './test-db'
import { seedAll } from './seed-data'

describe('seed', () => {
  beforeEach(resetTestDb)
  it('creates one planned piece per ordered unit', async () => {
    const r = await seedAll(testPrisma)
    const ordered = r.lineItems.reduce((n, li) => n + li.quantity, 0)
    expect(r.pieces).toHaveLength(ordered)
    expect(r.pieces.every((p) => p.state === 'PLANNED')).toBe(true)
    expect(r.users.store.role).toBe('store')
    expect(r.users.merchandiser.role).toBe('merchandiser')
    expect(r.workers.some((w) => w.type === 'paster')).toBe(true)
  })
  it('is idempotent', async () => {
    await seedAll(testPrisma)
    await seedAll(testPrisma)
    expect(await testPrisma.piece.count()).toBe(65)
  })

  it('seeds one published default checklist per step, stage and category, and a planned label per piece', async () => {
    const seed = await seedAll(testPrisma)
    const lists = await testPrisma.checklist.count({ where: { programId: null } })
    expect(lists).toBe(DEFAULT_CHECKLISTS.length)
    const drafts = await testPrisma.checklistVersion.count({ where: { publishedAt: null } })
    expect(drafts).toBe(0)
    const stitching = await testPrisma.checklist.findUniqueOrThrow({ where: { scopeKey: scopeKey('qa', 'stitching', 'jacket', null) }, include: { versions: { include: { items: true } } } })
    expect(stitching.versions[0]!.items.map((i) => i.textEn)).toEqual([
      'Both sleeves aligned', 'Zips aligned', 'Stitching follows the drawn line', 'No cut on the jacket', 'Take the photo',
    ])
    expect(await testPrisma.labelPrint.count({ where: { kind: 'planned', printedAt: null } })).toBe(seed.pieces.length)
    // Running again changes nothing.
    await seedAll(testPrisma)
    expect(await testPrisma.checklistVersion.count()).toBe(DEFAULT_CHECKLISTS.length)
  })

  it('seeds the three store items in display order', async () => {
    const r = await seedAll(testPrisma)
    expect(r.items.map((i) => i.code)).toEqual(['ZIP', 'WASH-LBL', 'PO-LBL'])
    expect(r.items[1]!.nameHi).toMatch(/[ऀ-ॿ]/)
    const again = await seedAll(testPrisma)
    expect(again.items).toHaveLength(3)
  })
})
