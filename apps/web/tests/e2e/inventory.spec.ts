import { expect, test } from '@playwright/test'
import { connectDb, db, disconnectDb, flipToEnglish, PHOTO, signIn } from './helpers'

test.beforeAll(connectDb)
test.afterAll(disconnectDb)

/**
 * A delivery arrives, a QA checker records it with three photos while the
 * photo reader prefills the items and the paper's numbers, and the store
 * counts it short. The reader is stubbed at the network edge: no request
 * leaves the machine, and the shape it answers with is the contract's.
 */
test('a delivery is recorded with prefilled items and counted short by the store', async ({ page }) => {
  // The dictation hook's `supported` flag is server-false, client-real (see
  // apps/web/lib/use-dictation.ts) precisely so DictateButton — mounted on
  // every TextField this flow passes through (shelf, supplier, receipt
  // number, counted quantities) — never disagrees with the server-rendered
  // HTML on first paint. A regression there is a React hydration error, not
  // a silent glitch, so it shows up in the page's own console/error events.
  const pageErrors: string[] = []
  page.on('pageerror', (err) => pageErrors.push(String(err)))
  page.on('console', (msg) => {
    if (msg.type() === 'error') pageErrors.push(msg.text())
  })

  await page.route('**/api/inventory/suggest', async (route) => {
    const body = route.request().postDataJSON() as { kind: string }
    await route.fulfill({
      json: body.kind === 'goods'
        ? { available: true, kind: 'goods', items: [{ code: 'ZIP', confidence: 0.92 }] }
        : { available: true, kind: 'document', document: { supplier: 'Rex Zips', reference: 'DC-1182', date: null, lines: [
            { text: 'YKK #5 zip black', quantity: 500, code: 'ZIP', confidence: 0.9 },
            { text: 'Woven care label', quantity: 200, code: 'WASH-LBL', confidence: 0.8 },
          ] } },
    })
  })

  await signIn(page, 'QA Checker')
  await flipToEnglish(page)
  await page.getByRole('link', { name: 'Inventory' }).click()
  await expect(page).toHaveURL(/\/inventory$/)
  // A QA checker records; only the store counts, so no queue here.
  await expect(page.getByRole('heading', { name: 'To count' })).toHaveCount(0)
  await page.getByRole('link', { name: 'Received a delivery' }).click()
  await expect(page).toHaveURL(/\/inventory\/receive$/)

  const next = () => page.getByRole('button', { name: 'Next', exact: true }).click()
  const stepTitle = (text: string) => page.locator('p.text-center', { hasText: text })
  const photo = async (purpose: 'goods' | 'place' | 'document') => {
    const box = page.locator(`[data-purpose=${purpose}]`)
    // A fresh step starts with its own empty camera: nothing taken yet and no
    // Retake — the previous step's photo must not carry over into this one.
    await expect(box.getByText(/^Photo taken/)).toHaveCount(0)
    await expect(box.getByRole('button', { name: 'Retake', exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeDisabled()
    await box.locator('input[type=file]').setInputFiles(PHOTO)
    await expect(box.getByText(/^Photo taken \(1\)$/)).toBeVisible({ timeout: 30_000 })
  }
  const zip = page.getByRole('button', { name: /^ZIP/ })
  const wash = page.getByRole('button', { name: /^WASH-LBL/ })

  // Step 1: goods photo — starts the goods suggestion.
  await expect(stepTitle('Photo of the goods')).toBeVisible()
  await photo('goods')
  await next()

  // Step 2: place photo + shelf.
  await expect(stepTitle('Where did you put it?')).toBeVisible()
  await photo('place')
  await page.getByLabel('Shelf or rack (optional)').fill('R2-B')
  await next()

  // Step 3: paper receipt photo — starts the document suggestion.
  await expect(stepTitle('Photo of the paper receipt')).toBeVisible()
  await photo('document')
  await next()

  // Step 4: item chips — goods suggestion pre-ticked; document suggestion applied even though it arrived after the person moved past steps 1-2.
  await expect(stepTitle('What is in it?')).toBeVisible()

  // Back to step 3: the receipt photo taken earlier is still counted, not lost.
  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await expect(stepTitle('Photo of the paper receipt')).toBeVisible()
  await expect(page.locator('[data-purpose=document]').getByText(/^Photo taken \(1\)$/)).toBeVisible()
  await next()
  await expect(stepTitle('What is in it?')).toBeVisible()

  await expect(zip).toHaveAttribute('aria-pressed', 'true')
  await expect(zip).toContainText('Suggested')
  await expect(zip).toContainText('Receipt says 500')
  await expect(wash).toHaveAttribute('aria-pressed', 'true')
  await expect(wash).toContainText('Receipt says 200')
  await next()

  // Step 5: supplier + receipt number, prefilled from the document suggestion.
  await expect(stepTitle('Who sent it?')).toBeVisible()
  await expect(page.getByLabel('From (supplier)')).toHaveValue('Rex Zips')
  await expect(page.getByLabel('Receipt number')).toHaveValue('DC-1182')
  await next()

  // Step 6: review, then confirm.
  await expect(stepTitle('Check and confirm')).toBeVisible()
  await expect(page.getByText('3 photos')).toBeVisible()
  await expect(page.getByText('Rex Zips')).toBeVisible()
  await expect(page.getByText('DC-1182')).toBeVisible()
  await expect(page.getByText('Receipt says 500')).toBeVisible()
  await expect(page.getByText('Receipt says 200')).toBeVisible()

  await page.getByRole('button', { name: 'CONFIRM', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Recorded' })).toBeVisible()

  const receipt = await db().inventoryReceipt.findFirstOrThrow({ include: { lines: true, attachments: true, events: true } })
  expect(receipt.status).toBe('RECEIVED')
  expect(receipt.supplier).toBe('Rex Zips')
  expect(receipt.location).toBe('R2-B')
  expect(receipt.attachments.map((a) => a.purpose).sort()).toEqual(['document', 'goods', 'place'])
  expect(receipt.lines.map((l) => l.expectedQty).sort()).toEqual([200, 500])
  expect(receipt.events).toHaveLength(1)
  expect((receipt.events[0]!.details as { suggestions: { document: { reference: string } } }).suggestions.document.reference).toBe('DC-1182')

  // The store counts it.
  await signIn(page, 'Store')
  await flipToEnglish(page)
  await page.goto('/inventory')
  await page.getByRole('link', { name: /ZIP · WASH-LBL/ }).click()
  await expect(page).toHaveURL(/\/inventory\/receipts\/[0-9a-f-]{36}\/count$/)
  const countUrl = page.url()
  // A full page load, not a client navigation: this is the exact case a
  // TextField/DictateButton hydration mismatch would show up on — server HTML
  // rendered with the mic hidden, first client render either matching (fixed)
  // or flipping to a `<button>` before hydration settles (regressed).
  await page.goto(countUrl)
  await expect(page.getByLabel('Receipt says ZIP')).toHaveValue('500')
  await expect(page.getByLabel('Receipt says WASH-LBL')).toHaveValue('200')
  await expect(page.getByRole('img', { name: 'Photo of the goods' })).toBeVisible()
  await page.getByLabel('Counted ZIP').fill('480')
  await page.getByLabel('Counted WASH-LBL').fill('200')
  await page.getByRole('button', { name: 'CONFIRM', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Counted' })).toBeVisible()
  await expect(page.getByText('ZIP short by 20')).toBeVisible()

  const counted = await db().inventoryReceipt.findUniqueOrThrow({ where: { id: receipt.id }, include: { lines: true } })
  expect(counted).toMatchObject({ status: 'COUNTED', hasDiscrepancy: true, version: 1 })
  expect(counted.lines.find((l) => l.expectedQty === 500)?.countedQty).toBe(480)
  expect(await db().inventoryEvent.count({ where: { receiptId: receipt.id } })).toBe(2)

  // Counted receipts leave the queue.
  await page.getByRole('link', { name: 'Next to count' }).click()
  await expect(page.getByText('Nothing waiting to be counted.')).toBeVisible()

  // No React hydration mismatch anywhere in this run — the regression this
  // guards is silent otherwise: DictateButton renders on the server as
  // `null` and would flip to a `<button>` on the client's first render if
  // `supported` were computed with a plain lazy useState instead of
  // useSyncExternalStore's server/client snapshot split.
  for (const msg of pageErrors) {
    expect(msg).not.toMatch(/hydrat/i)
  }
})
