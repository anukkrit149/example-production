import { expect, test } from '@playwright/test'
import { connectDb, db, disconnectDb, fillDrawer, nav, signIn } from './helpers'

test.beforeAll(connectDb)
test.afterAll(disconnectDb)

// A 1x1 white JPEG, so the receipt detail page's `EventPhoto` finds a real
// object at the presigned URL instead of degrading to "Photo unavailable" —
// other e2e/integration suites never render these fake-storageKey photos as
// an `<img>`, but this spec's "Goods photo" assertion does, so the fixture
// here must actually exist in the bucket.
const PIXEL_JPEG = Uint8Array.from(
  atob('/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k='),
  (c) => c.charCodeAt(0),
)

/** Two receipts straight through the service (the phone flow has its own suite): one counted short, one waiting. */
async function seedReceipts() {
  const { seedAll } = (await import('@hf/db')) as typeof import('@hf/db')
  const { countReceipt, presignPhotoUpload, recordReceipt } = (await import('@hf/server')) as typeof import('@hf/server')
  const seed = await seedAll(db())
  const photo = async () => {
    const storageKey = `t/${crypto.randomUUID()}.jpg`
    const uploadUrl = await presignPhotoUpload(storageKey, 'image/jpeg')
    const put = await fetch(uploadUrl, { method: 'PUT', body: PIXEL_JPEG })
    if (!put.ok) throw new Error(`fixture photo upload failed: ${put.status} ${await put.text()}`)
    return (await db().attachment.create({ data: { storageKey, mime: 'image/jpeg', bytes: PIXEL_JPEG.byteLength, takenById: seed.users.qa.id, confirmedAt: new Date() } })).id
  }
  const photos = async () => ({ goods: [await photo()], place: [await photo()], document: [await photo()] })
  const a = await recordReceipt({ user: seed.users.qa, idempotencyKey: 'e2e-inv-a-0001', input: { attachmentIds: [], items: [{ itemId: seed.items[0]!.id, expectedQty: 500 }, { itemId: seed.items[1]!.id, expectedQty: 200 }], photos: await photos(), supplier: 'Rex Zips', reference: 'DC-1182' } })
  await countReceipt({ id: a.receipt.id, user: seed.users.store, idempotencyKey: 'e2e-inv-a-0002', input: { attachmentIds: [], expectedVersion: 0, lines: [{ itemId: seed.items[0]!.id, expectedQty: 500, countedQty: 480 }, { itemId: seed.items[1]!.id, expectedQty: 200, countedQty: 200 }] } })
  await recordReceipt({ user: seed.users.qa, idempotencyKey: 'e2e-inv-b-0001', input: { attachmentIds: [], items: [{ itemId: seed.items[2]!.id, expectedQty: 50 }], photos: await photos(), supplier: 'LabelCo', reference: 'LC-77' } })
}

test('the office sees stock, filters flagged receipts, opens one, and an admin adds an item', async ({ page }) => {
  await seedReceipts()
  await signIn(page, 'Admin')
  await nav(page, 'Inventory', /\/inventory$/)

  // Tiles: ZIP on hand is the counted 480; PO-LBL has one receipt waiting.
  await expect(page.getByText(/^480/)).toBeVisible()
  await expect(page.getByText('1 awaiting count')).toBeVisible()

  // Both receipts listed with their badges.
  await expect(page.getByRole('link', { name: 'DC-1182' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'LC-77' })).toBeVisible()
  await expect(page.getByRole('cell', { name: /Discrepancy/ })).toBeVisible()

  // Filter to flagged only, without a full reload.
  await page.getByRole('combobox', { name: 'Flagged' }).click()
  await page.getByRole('option', { name: 'Flagged only' }).click()
  await expect(page).toHaveURL(/discrepancy=1/)
  await expect(page.getByRole('link', { name: 'DC-1182' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'LC-77' })).toHaveCount(0)

  // Detail: variance in the table, timeline with both events.
  await page.getByRole('link', { name: 'DC-1182' }).click()
  await expect(page.getByRole('heading', { name: 'Receipt DC-1182' })).toBeVisible()
  await expect(page.getByRole('cell', { name: '-20' })).toBeVisible()
  await expect(page.getByText('Recorded by QA Checker')).toBeVisible()
  await expect(page.getByText('Counted by Store Operator')).toBeVisible()
  await expect(page.getByRole('img', { name: 'Goods photo' })).toBeVisible()

  // Items: add one; it shows in the table.
  await page.goto('/inventory/items')
  await page.getByRole('button', { name: 'New item' }).click()
  await fillDrawer(page, { Code: 'btn', 'English name': 'Button', 'Hindi name': 'बटन', Unit: 'pcs', Position: '4' }, /create item/i)
  await expect(page.getByRole('cell', { name: 'BTN' })).toBeVisible()
  expect(await db().inventoryItem.count()).toBe(4)

  // Edit: deactivate.
  await page.getByRole('row', { name: /BTN/ }).getByRole('button', { name: 'Edit' }).click()
  const drawer = page.getByRole('dialog')
  await drawer.getByLabel('Active (offered on the phone)').uncheck()
  await drawer.getByRole('button', { name: 'Save' }).click()
  await expect(drawer).toBeHidden()
  await expect(page.getByRole('row', { name: /BTN/ })).toContainText('No')
})

test('a store user sees inventory but not the item settings', async ({ page }) => {
  await signIn(page, 'Store')
  await nav(page, 'Inventory', /\/inventory$/)
  await expect(page.getByRole('link', { name: 'Items' })).toHaveCount(0)
  // `notFound()` correctly renders Next's not-found boundary here — confirmed
  // by the "404" heading and "This page could not be found." body text below
  // — but Next 16's dev server (Turbopack) serves that render over a 200
  // response rather than a 404 status; the same is true of every other
  // role-gated `notFound()` page in this app (e.g. /checklists), so this is a
  // dev-mode transport quirk, not a bug in the inventory page. Assert on the
  // rendered not-found content instead of the HTTP status.
  await page.goto('/inventory/items')
  await expect(page.getByRole('heading', { name: '404' })).toBeVisible()
  await expect(page.getByText('This page could not be found.')).toBeVisible()
})
