import { expect, test, type Page } from '@playwright/test'
import { connectDb, db, disconnectDb, signIn } from './helpers'

test.beforeAll(connectDb)
test.afterAll(disconnectDb)

/** The office checks status from a phone: nothing scrolls sideways, the menu navigates, lists read as cards. */
const fitsTheScreen = async (page: Page) => {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow, 'page must not scroll horizontally').toBeLessThanOrEqual(0)
  const wideTables = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLTableElement>('.hf-table')]
      .filter((t) => { const box = t.parentElement ?? t; return box.scrollWidth > box.clientWidth })
      .map((t) => t.className),
  )
  expect(wideTables, 'every table must render as cards on a phone').toEqual([])
}

// Minimal equivalent of `tests/integration/helpers.ts`'s `packPiece`, reproduced
// here rather than imported: that module pulls in `@hf/db/test`, which throws
// unless TEST_DATABASE_URL is set — a variable the e2e environment never sets.
async function packOnePiece(): Promise<void> {
  const { seedAll } = (await import('@hf/db')) as typeof import('@hf/db')
  const { runPieceAction } = (await import('@hf/server')) as typeof import('@hf/server')
  const seed = await seedAll(db()) // idempotent: hands back the already-seeded rows
  const p = seed.pieces[0]!
  const w = seed.workers[1]!
  const photo = async () => (await db().attachment.create({ data: { storageKey: `t/${crypto.randomUUID()}.jpg`, mime: 'image/jpeg', bytes: 1, takenById: seed.users.store.id } })).id
  const k = (s: string) => `mobile-pack-${s}`
  await runPieceAction({ pieceId: p.id, user: seed.users.store, idempotencyKey: k('act'), event: { type: 'PIECE_ACTIVATED', stage: 'cutting' }, attachmentIds: [await photo()] })
  await runPieceAction({ pieceId: p.id, user: seed.users.qa, idempotencyKey: k('qa-cut'), event: { type: 'STAGE_QA_PASSED', stage: 'cutting' }, attachmentIds: [await photo()] })
  for (const stage of ['pasting', 'stitching', 'finishing'] as const) {
    await runPieceAction({ pieceId: p.id, user: seed.users.store, idempotencyKey: k(`iss-${stage}`), event: { type: 'ISSUED', stage }, workerId: w.id, afterWorker: w.id, attachmentIds: [await photo()] })
    await runPieceAction({ pieceId: p.id, user: seed.users.store, idempotencyKey: k(`rec-${stage}`), event: { type: 'RECEIVED', stage }, workerId: w.id, afterWorker: null, attachmentIds: [await photo()] })
    await runPieceAction({ pieceId: p.id, user: seed.users.qa, idempotencyKey: k(`qa-${stage}`), event: { type: 'STAGE_QA_PASSED', stage }, attachmentIds: [await photo()] })
  }
  await runPieceAction({ pieceId: p.id, user: seed.users.qa, idempotencyKey: k('qc'), event: { type: 'STAGE_QA_PASSED', stage: 'qc' }, attachmentIds: [await photo()] })
  await runPieceAction({ pieceId: p.id, user: seed.users.store, idempotencyKey: k('pack'), event: { type: 'PACKED' }, details: { carton: 'CTN-1' }, attachmentIds: [await photo()] })
}

/**
 * One receipt so `/inventory`'s table has a row and the phone-cards check
 * below is actually exercised — with none, the page shows `<Empty>` and
 * "every table must render as cards" passes vacuously.
 */
async function recordOneReceipt(): Promise<void> {
  const { seedAll } = (await import('@hf/db')) as typeof import('@hf/db')
  const { recordReceipt } = (await import('@hf/server')) as typeof import('@hf/server')
  const seed = await seedAll(db()) // idempotent: hands back the already-seeded rows
  // A fake storage key is fine here: `fitsTheScreen` never asserts the image loads.
  const photo = async () => (await db().attachment.create({ data: { storageKey: `t/${crypto.randomUUID()}.jpg`, mime: 'image/jpeg', bytes: 1, takenById: seed.users.qa.id, confirmedAt: new Date() } })).id
  await recordReceipt({
    user: seed.users.qa,
    idempotencyKey: 'mobile-inv-a-0001',
    input: {
      attachmentIds: [],
      items: [{ itemId: seed.items[0]!.id, expectedQty: 500 }, { itemId: seed.items[1]!.id, expectedQty: 200 }],
      photos: { goods: [await photo()], place: [await photo()], document: [await photo()] },
      supplier: 'Rex Zips',
      reference: 'DC-1182',
    },
  })
}

test('a merchandiser checks programs, orders and an order from a phone', async ({ page }) => {
  // A packed piece so the order page's cartons table has a row to render.
  await packOnePiece()
  // A receipt so the inventory page's table has a row to render.
  await recordOneReceipt()

  await signIn(page, 'Merchandiser')
  await expect(page.getByRole('button', { name: 'Menu' })).toBeVisible()
  // Sign-in lands on the overview: the widest screen in the app, so it is the
  // one worth measuring before anything else.
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible()
  await fitsTheScreen(page)

  await page.getByRole('button', { name: 'Menu' }).click()
  await page.getByRole('dialog', { name: 'Menu' }).getByRole('link', { name: 'Programs' }).click()
  await expect(page).toHaveURL(/\/programs$/)
  await fitsTheScreen(page)
  await expect(page.getByRole('link', { name: 'Autumn 26' })).toBeVisible()

  await page.getByRole('button', { name: 'Menu' }).click()
  await page.getByRole('dialog', { name: 'Menu' }).getByRole('link', { name: 'Orders' }).click()
  await expect(page).toHaveURL(/\/orders$/)
  await expect(page.getByRole('dialog', { name: 'Menu' })).toBeHidden()
  await fitsTheScreen(page)

  await page.getByRole('link', { name: 'PO-4471' }).click()
  await expect(page).toHaveURL(/\/orders\/[0-9a-f-]+$/)
  await expect(page.getByText('Ordered pieces')).toBeVisible()
  await fitsTheScreen(page)

  await page.getByRole('button', { name: 'Menu' }).click()
  await page.getByRole('dialog', { name: 'Menu' }).getByRole('link', { name: 'WIP' }).click()
  await expect(page).toHaveURL(/\/wip$/)
  await fitsTheScreen(page)

  await page.getByRole('button', { name: 'Menu' }).click()
  await page.getByRole('dialog', { name: 'Menu' }).getByRole('link', { name: 'Inventory' }).click()
  await expect(page).toHaveURL(/\/inventory$/)
  // The receipts table must actually be there — otherwise the cards check
  // below passes vacuously against an empty-state page.
  await expect(page.locator('.hf-table')).toHaveCount(1)
  await fitsTheScreen(page)
})
