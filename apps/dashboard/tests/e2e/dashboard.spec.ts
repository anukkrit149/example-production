import path from 'node:path'
import { expect, test } from '@playwright/test'
import { connectDb, db, disconnectDb, fillDrawer, nav, signIn } from './helpers'

test.beforeAll(connectDb)
test.afterAll(disconnectDb)

test('a merchandiser sets up a buyer, program, order, style and line item, and watches the floor cut the first piece', async ({ page }) => {
  await signIn(page, 'Merchandiser')

  // Buyer and buying house.
  await nav(page, 'Buyers', /\/organizations$/)
  await page.getByRole('button', { name: 'New buyer or buying house' }).click()
  await fillDrawer(page, { Type: 'Buyer', Name: 'Maison Rive' }, /create/i)
  await expect(page.getByRole('cell', { name: 'Maison Rive' })).toBeVisible()
  await page.getByRole('button', { name: 'New buyer or buying house' }).click()
  await fillDrawer(page, { Type: 'Buying house', Name: 'Atlas Sourcing' }, /create/i)
  await expect(page.getByRole('cell', { name: 'Atlas Sourcing' })).toBeVisible()

  // Program.
  await nav(page, 'Programs', /\/programs$/)
  await page.getByRole('button', { name: 'New program' }).click()
  await fillDrawer(page, { Name: 'Spring 27', Buyer: 'Maison Rive', 'Buying house': 'Atlas Sourcing', Season: 'SS27' }, /create program/i)
  await page.getByRole('link', { name: 'Spring 27' }).click()
  await expect(page).toHaveURL(/\/programs\/[^/]+$/)
  await expect(page.getByRole('heading', { name: 'Spring 27' })).toBeVisible()

  // Order — the duplicate is refused readably, the real one is created.
  await page.getByRole('button', { name: 'New order' }).click()
  await fillDrawer(page, { 'Order number': 'PO-9001', 'Due date': '2027-03-15' }, /create order/i)
  await page.getByRole('button', { name: 'New order' }).click()
  const drawer = page.getByRole('dialog')
  await drawer.getByLabel('Order number', { exact: true }).fill('PO-9001')
  await drawer.getByRole('button', { name: /create order/i }).click()
  await expect(drawer.getByRole('alert')).toHaveText('Order PO-9001 already exists in Spring 27')
  await page.keyboard.press('Escape')

  // Style, with a reference photo and the category tabs.
  await nav(page, 'Styles', /\/styles$/)
  await page.getByRole('button', { name: 'New style' }).click()
  const styleDrawer = page.getByRole('dialog')
  await styleDrawer.getByLabel('Style code', { exact: true }).fill('lj-900')
  await styleDrawer.getByLabel('Category', { exact: true }).selectOption({ label: 'jacket' })
  await styleDrawer.getByLabel('Gender', { exact: true }).selectOption({ label: 'womens' })
  await styleDrawer.getByLabel('Owner', { exact: true }).selectOption({ label: 'Maison Rive' })
  await styleDrawer.getByLabel('Description', { exact: true }).fill('Biker, lamb')
  await styleDrawer.getByLabel('Reference photo', { exact: true }).setInputFiles(path.resolve(__dirname, 'fixtures/reference.jpg'))
  await expect(styleDrawer.getByRole('img', { name: 'Reference photo preview' })).toBeVisible()
  await styleDrawer.getByRole('button', { name: /create style/i }).click()
  await expect(styleDrawer).toBeHidden()
  await expect(page.getByRole('link', { name: 'LJ-900' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Category' }).getByRole('link', { name: /^all/ })).toHaveAttribute('aria-current', 'page')
  await page.getByRole('navigation', { name: 'Category' }).getByRole('link', { name: /^jacket/ }).click()
  await expect(page).toHaveURL(/category=jacket/)
  await expect(page.getByRole('link', { name: 'LJ-900' })).toBeVisible()
  await page.getByRole('link', { name: 'LJ-900' }).click()
  const referencePhoto = page.getByRole('img', { name: 'Reference photo for LJ-900' })
  await expect(referencePhoto).toBeVisible()
  expect(await referencePhoto.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)

  // Edit the style; the reference photo survives an edit that never touches it.
  await page.getByRole('button', { name: 'Edit' }).click()
  const editDrawer = page.getByRole('dialog')
  await editDrawer.getByLabel('Description', { exact: true }).fill('Biker, lamb, gold zips')
  await editDrawer.getByRole('button', { name: /save/i }).click()
  await expect(editDrawer).toBeHidden()
  const referencePhotoAfterEdit = page.getByRole('img', { name: 'Reference photo for LJ-900' })
  await expect(referencePhotoAfterEdit).toBeVisible()
  expect(await referencePhotoAfterEdit.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
  await expect(page.getByText('Biker, lamb, gold zips')).toBeVisible()

  await nav(page, 'Styles', /\/styles$/)

  // Line item: 5 planned pieces appear.
  await nav(page, 'Orders', /\/orders$/)
  await page.getByRole('link', { name: 'PO-9001' }).click()
  await expect(page).toHaveURL(/\/orders\/[^/]+$/)
  await page.getByRole('button', { name: 'Add line item' }).click()
  await fillDrawer(page, { Style: 'LJ-900 · jacket · Biker, lamb, gold zips', Size: 'M', Shade: 'blk-02', Quantity: '5' }, /add line item/i)
  const row = page.getByRole('row', { name: /LJ-900/ })
  await expect(row).toContainText('BLK-02')
  await expect(row.getByRole('cell').nth(3)).toHaveText('5')
  const lineItem = await db().orderLineItem.findFirstOrThrow({ where: { shade: 'BLK-02', style: { styleCode: 'LJ-900' } } })
  expect(await db().piece.count({ where: { lineItemId: lineItem.id, state: 'PLANNED' } })).toBe(5)

  // Quantity up, then down with a reason.
  await row.getByRole('button', { name: 'Qty' }).click()
  await fillDrawer(page, { 'New quantity': '7' }, /change quantity/i)
  await expect(row.getByRole('cell').nth(3)).toHaveText('7')
  await row.getByRole('button', { name: 'Qty' }).click()
  await fillDrawer(page, { 'New quantity': '6', Reason: 'buyer trimmed the order' }, /change quantity/i)
  await expect(row.getByRole('cell').nth(3)).toHaveText('6')
  expect(await db().piece.count({ where: { lineItemId: lineItem.id, state: 'PLANNED' } })).toBe(6)
  expect(await db().piece.count({ where: { lineItemId: lineItem.id, state: 'CANCELLED' } })).toBe(1)

  // The floor cuts the first piece, through the single write path, against the same database.
  const admin = await db().user.findFirstOrThrow({ where: { role: 'admin' } })
  const first = await db().piece.findFirstOrThrow({ where: { lineItemId: lineItem.id, state: 'PLANNED' }, orderBy: { serial: 'asc' } })
  const { runPieceAction, resolveChecklistVersion } = (await import('@hf/server')) as typeof import('@hf/server')

  // `runPieceAction` is the single write path, but it is not itself the gate —
  // every real route resolves and asserts the checklist first (see
  // `checklist-gate.ts`) and hands the record down as `details.checklist`.
  // This call skips the route, so it builds that same record by hand: an
  // activation without one is not a shape `PIECE_ACTIVATED` ever has in
  // production.
  const activateChecklist = await resolveChecklistVersion({ step: 'activate', stage: null, category: 'jacket', programId: null })
  const qaChecklist = await resolveChecklistVersion({ step: 'qa', stage: 'cutting', category: 'jacket', programId: null })
  const checklistDetails = (resolved: NonNullable<typeof activateChecklist>) => ({
    checklist: {
      checklistVersionId: resolved.id,
      checklistNumber: resolved.number,
      answers: resolved.items.map((i) => ({ itemId: i.id, kind: i.kind, textEn: i.textEn, textHi: i.textHi, value: true as const })),
    },
  })
  await runPieceAction({ pieceId: first.id, user: admin, idempotencyKey: `e2e-${first.id}-act`, event: { type: 'PIECE_ACTIVATED', stage: 'cutting' }, details: { leatherLot: 'LOT-E2E', photoOverrideReason: 'e2e', ...checklistDetails(activateChecklist!) } })
  await runPieceAction({ pieceId: first.id, user: admin, idempotencyKey: `e2e-${first.id}-qa`, event: { type: 'STAGE_QA_PASSED', stage: 'cutting' }, details: { photoOverrideReason: 'e2e', ...checklistDetails(qaChecklist!) } })

  // The office sees it at cutting; the number links to the piece; the piece shows its history.
  await page.reload()
  const cut = row.getByRole('cell').nth(4)
  await expect(cut).toHaveText('1')
  await cut.getByRole('link').click()
  await expect(page).toHaveURL(/\/pieces\?lineItemId=.*atOrPast=cutting/)
  await expect(page.getByRole('heading', { name: /^1 at or past cutting$/ })).toBeVisible()
  await page.getByRole('link', { name: '#0001' }).click()
  await expect(page).toHaveURL(/\/pieces\/[^/]+$/)
  await expect(page.getByText('Cut OK', { exact: true })).toBeVisible()
  await expect(page.getByText('Piece activated')).toBeVisible()
  await expect(page.getByText('Stage QA passed')).toBeVisible()
  await expect(page.getByText('Label print requested')).toBeVisible()
})

test('management can read everything and change nothing', async ({ page }) => {
  await signIn(page, 'Management')
  // Sign-in lands on the overview now; the read-only checks are on the program list.
  await nav(page, 'Programs', /\/programs$/)
  await expect(page.getByRole('button', { name: 'New program' })).toHaveCount(0)
  await page.getByRole('link', { name: 'Autumn 26' }).click()
  await expect(page.getByRole('button', { name: 'New order' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Team' })).toHaveCount(0)
  await page.goto('/team')
  await expect(page).toHaveURL(/\/overview$/)
})

test('signed out lands on sign in', async ({ page }) => {
  await page.goto('/programs')
  await expect(page).toHaveURL(/\/signin$/)
})

// The auth UI moves between its steps by URL (/auth/email-otp, /auth/callback…).
// Locally Neon Auth is not configured, so those steps hand back to /signin; an
// unknown step is a plain 404. Either way the route exists — it was a 404 page
// for every step in production once.
test('auth flow steps resolve', async ({ page }) => {
  await page.goto('/auth/email-otp')
  await expect(page).toHaveURL(/\/signin$/)
  const res = await page.goto('/auth/not-a-step')
  expect(res?.status()).toBe(404)
})
